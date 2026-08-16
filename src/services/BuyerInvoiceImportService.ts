// src/services/BuyerInvoiceImportService.ts
// Import the LiveAuctioneers end-of-auction invoice PDF into buyer_invoices.
// Parsing runs in the browser via pdf.js (same approach as CatalogueImportService);
// the DB writes run in the user's session so RLS holds.
//
// The EOA XML gives hammer + premium only. This document is the sole source of
// sales tax, shipping and the online-payments fee, and of what each buyer still owes.

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '../lib/supabase';
import { parseLaInvoices, splitShipTo, type LaInvoice } from '../lib/laInvoiceParse';
import type { BuyerInvoiceRecord } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function parseInvoicePdf(file: File): Promise<LaInvoice[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  // Reconstruct lines from pdf.js text items using their EOL markers.
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    let line = '';
    for (const item of content.items) {
      const str = (item as { str?: string }).str ?? '';
      line += str;
      if ((item as { hasEOL?: boolean }).hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
  }

  return parseLaInvoices(lines);
}

export interface ImportInvoicesResult {
  imported: number;
  matchedLots: number;      // lots in this sale carrying one of the invoice ids
  unmatchedInvoices: string[];  // invoice ids with no lot in this sale
  flagged: string[];        // invoice ids whose printed total doesn't add up
  markedPaid: number;
  salesTax: number;
  shipping: number;
}

export interface ImportInvoicesOptions {
  saleId: string;
  companyId?: string;
  /** Mark lots paid where LA shows the invoice settled (balance due 0). */
  applyPaymentStatus: boolean;
}

export async function importBuyerInvoices(
  invoices: LaInvoice[],
  opts: ImportInvoicesOptions,
): Promise<ImportInvoicesResult> {
  const { saleId, companyId, applyPaymentStatus } = opts;

  const rows = invoices.map((inv) => ({
    company_id: companyId,
    sale_id: saleId,
    la_invoice_id: inv.invoiceId,
    status: inv.status,
    buyer_name: inv.buyerName ?? null,
    buyer_email: inv.buyerEmail ?? null,
    buyer_phone: inv.buyerPhone ?? null,
    ship_to: { lines: inv.shipTo, ...splitShipTo(inv.shipTo) },
    shipping_method: inv.shippingMethod ?? null,
    hammer_total: inv.hammerTotal,
    premium_total: inv.premiumTotal,
    shipping: inv.shipping,
    online_fee: inv.onlineFee,
    sales_tax: inv.salesTax,
    total: inv.total,
    balance_due: inv.balanceDue,
    payment_method: inv.paymentMethod ?? null,
    paid_at_text: inv.paidAtText ?? null,
    lot_numbers: inv.lots.map((l) => l.lotNumber),
    totals_balance: inv.totalsBalance,
    imported_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Re-importing a corrected PDF should update in place, not duplicate.
  const { error } = await supabase
    .from('buyer_invoices')
    .upsert(rows, { onConflict: 'sale_id,la_invoice_id' });
  if (error) throw error;

  // Which of this sale's lots do these invoices actually cover?
  const ids = invoices.map((i) => i.invoiceId);
  const { data: lotRows, error: lotErr } = await supabase
    .from('lots')
    .select('id, la_invoice_id, payment_status')
    .eq('sale_id', saleId)
    .in('la_invoice_id', ids);
  if (lotErr) throw lotErr;

  const covered = new Set((lotRows ?? []).map((l) => l.la_invoice_id));
  const unmatchedInvoices = ids.filter((id) => !covered.has(id));

  let markedPaid = 0;
  if (applyPaymentStatus) {
    // LA is the payment processor on this path: a zero balance means the buyer paid.
    const settled = invoices.filter((i) => i.balanceDue <= 0).map((i) => i.invoiceId);
    const toMark = (lotRows ?? []).filter(
      (l) => settled.includes(l.la_invoice_id) && l.payment_status !== 'paid',
    );
    if (toMark.length > 0) {
      const { error: payErr } = await supabase
        .from('lots')
        .update({ payment_status: 'paid' })
        .in('id', toMark.map((l) => l.id));
      if (payErr) throw payErr;
      markedPaid = toMark.length;
    }
  }

  return {
    imported: rows.length,
    matchedLots: (lotRows ?? []).length,
    unmatchedInvoices,
    flagged: invoices.filter((i) => !i.totalsBalance).map((i) => i.invoiceId),
    markedPaid,
    salesTax: Math.round(invoices.reduce((s, i) => s + i.salesTax, 0) * 100) / 100,
    shipping: Math.round(invoices.reduce((s, i) => s + i.shipping, 0) * 100) / 100,
  };
}

export async function listBuyerInvoices(saleId: string): Promise<BuyerInvoiceRecord[]> {
  const { data, error } = await supabase
    .from('buyer_invoices')
    .select('*')
    .eq('sale_id', saleId);
  if (error) throw error;
  return data || [];
}
