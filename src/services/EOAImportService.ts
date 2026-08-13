// src/services/EOAImportService.ts
// D3 — import a LiveAuctioneers End-of-Auction (EOA) export and seed a sale from it.
// Handles the AmApi `eoa-list` XML format (the .txt/.xml export). Parsing is pure;
// importEoaAsNewSale() runs in the user's authenticated session so RLS is satisfied.
// See docs/auction-lifecycle-spec.md (§8-D3).

import { supabase } from '../lib/supabase';
import type { LotBuyer } from '../types';

export interface EOAItem {
  lotNumber: number | null;
  title: string;
  hammer: number;
  buyersPremium: number;
  invoiceID: string;
  buyer: LotBuyer;
}

export interface ParsedEOA {
  saleDate: Date | null;
  catalogID: string | null;
  count: number;
  items: EOAItem[];
}

// Text of a direct child element (CDATA included), trimmed. LA wraps values in
// CDATA padded with spaces, e.g. `<![CDATA[ Darren ]]>`.
function childText(parent: Element, tag: string): string {
  const el = parent.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() ?? '';
}

function toNumberOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// "202505081100" (YYYYMMDDHHMM) → Date, or null.
function parseSaleDate(s: string): Date | null {
  if (!/^\d{12}$/.test(s)) return null;
  const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8);
  const h = +s.slice(8, 10), mi = +s.slice(10, 12);
  return new Date(y, mo - 1, d, h, mi);
}

export function parseEoaXml(xmlText: string): ParsedEOA {
  // Saving the XML from a browser's built-in viewer prepends a human note
  // ("This XML file does not appear to have any style information…") before the
  // root element, which is not well-formed. Strip anything before the first tag.
  const start = xmlText.indexOf('<');
  const cleaned = start > 0 ? xmlText.slice(start) : xmlText;
  const doc = new DOMParser().parseFromString(cleaned, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Could not parse the file as XML. Is this a LiveAuctioneers EOA export?');
  }
  const itemEls = Array.from(doc.getElementsByTagName('item'));
  if (itemEls.length === 0) {
    throw new Error('No <item> entries found — this does not look like an EOA list export.');
  }

  let saleDate: Date | null = null;
  let catalogID: string | null = null;

  const items: EOAItem[] = itemEls.map((item) => {
    const buyerEl = item.getElementsByTagName('buyer')[0];
    const detailsEl = item.getElementsByTagName('details')[0];
    const saleEl = item.getElementsByTagName('sale')[0];

    if (detailsEl && !saleDate) saleDate = parseSaleDate(childText(detailsEl, 'saleDate'));
    if (saleEl && !catalogID) catalogID = saleEl.getAttribute('catalogID');

    const first = buyerEl ? childText(buyerEl, 'buyer_first_name') : '';
    const last = buyerEl ? childText(buyerEl, 'buyer_last_name') : '';
    const buyer: LotBuyer = buyerEl
      ? {
          name: [first, last].filter(Boolean).join(' ') || undefined,
          username: childText(buyerEl, 'username') || undefined,
          email: childText(buyerEl, 'email') || undefined,
          phone: childText(buyerEl, 'buyer_phone') || undefined,
          address: childText(buyerEl, 'buyer_address') || undefined,
          city: childText(buyerEl, 'buyer_city') || undefined,
          state: childText(buyerEl, 'buyer_state') || undefined,
          zip: childText(buyerEl, 'buyer_zip_code') || undefined,
          country: childText(buyerEl, 'buyer_country') || undefined,
        }
      : {};

    return {
      lotNumber: detailsEl ? toNumberOrNull(childText(detailsEl, 'lotNumber')) : null,
      title: detailsEl ? childText(detailsEl, 'title') : '',
      hammer: saleEl ? parseFloat(childText(saleEl, 'hammer')) || 0 : 0,
      buyersPremium: saleEl ? parseFloat(childText(saleEl, 'buyersPrem')) || 0 : 0,
      invoiceID: saleEl?.getAttribute('invoiceID') ?? '',
      buyer,
    };
  });

  return { saleDate, catalogID, count: items.length, items };
}

export interface ImportOptions {
  companyId: string;
  saleName: string;
  location?: string;
  consignorName: string;
  commissionRate: number;   // percent
  paymentTermsHours: number; // e.g. 72
}

export interface ImportResult {
  saleId: string;
  consignmentId: string;
  lotsCreated: number;
}

// Create a sale (in the settlement stage), one consignor + consignment, and a lot per
// EOA item (sold, unpaid, due paymentTermsHours after the auction — matching spec §4.1).
export async function importEoaAsNewSale(parsed: ParsedEOA, opts: ImportOptions): Promise<ImportResult> {
  const { companyId, saleName, location, consignorName, commissionRate, paymentTermsHours } = opts;

  // 1. Sale — a completed auction whose results are now being settled.
  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .insert({
      company_id: companyId,
      name: saleName,
      location: location || null,
      start_date: parsed.saleDate ? parsed.saleDate.toISOString() : null,
      status: 'active',
      stage: 'settlement',
      sale_type: 'auction',
    })
    .select()
    .single();
  if (saleErr) throw saleErr;

  // 2. Consignor (contact) + consignment terms.
  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .insert({
      company_id: companyId,
      sale_id: sale.id,
      business_name: consignorName,
      contact_type: 'consignor',
    })
    .select()
    .single();
  if (contactErr) throw contactErr;

  const { data: consignment, error: consErr } = await supabase
    .from('consignments')
    .insert({
      company_id: companyId,
      sale_id: sale.id,
      contact_id: contact.id,
      commission_rate: commissionRate,
    })
    .select()
    .single();
  if (consErr) throw consErr;

  // 3. Lots — one per EOA item.
  const nowIso = new Date().toISOString();
  const paymentDueAt = parsed.saleDate
    ? new Date(parsed.saleDate.getTime() + paymentTermsHours * 3600 * 1000).toISOString()
    : null;

  const rows = parsed.items.map((it) => ({
    id: crypto.randomUUID(),
    sale_id: sale.id,
    lot_number: it.lotNumber,
    name: it.title || `Lot ${it.lotNumber ?? ''}`.trim(),
    sold_price: it.hammer,
    buyers_premium: it.buyersPremium,
    la_invoice_id: it.invoiceID || null,
    buyer: it.buyer,
    consignment_id: consignment.id,
    outcome: 'sold',
    payment_status: 'unpaid',
    payment_due_at: paymentDueAt,
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const { error: lotsErr } = await supabase.from('lots').insert(rows);
  if (lotsErr) throw lotsErr;

  return { saleId: sale.id, consignmentId: consignment.id, lotsCreated: rows.length };
}
