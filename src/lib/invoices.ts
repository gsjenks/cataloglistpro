// src/lib/invoices.ts
// Pure buyer-invoice math for the packing session. Groups a sale's sold lots by
// buyer and totals hammer → buyer's premium → tax → amount due.
//
// Sales tax is NOT stored on the auction path (LiveAuctioneers collects and remits
// it), so the rate is supplied by the caller — 0 means "no tax line, LA handled it".
// Tax base is hammer + premium, the common auction convention.

import type { Lot, LotBuyer } from '../types';

export interface InvoiceLine {
  lotId: string;
  lotNumber: number | string | undefined;
  name: string;
  hammer: number;
  premium: number;
  paid: boolean;
  carrier?: string;
}

export interface BuyerInvoice {
  key: string;
  buyerName: string;
  buyer: LotBuyer;
  lines: InvoiceLine[];
  invoiceIds: string[];      // LiveAuctioneers invoice id(s), when imported
  hammerTotal: number;
  premiumTotal: number;
  taxRate: number;           // percent
  tax: number;
  total: number;
  paidCount: number;
  unpaidCount: number;
  carriers: string[];        // distinct handoff values across the buyer's lots
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const buyerKeyOf = (l: Lot): string => {
  const b = l.buyer ?? {};
  return b.email || b.name || 'unknown';
};

export const isSold = (l: Lot): boolean => l.outcome === 'sold' || (l.sold_price ?? 0) > 0;

export function buildBuyerInvoices(lots: Lot[], taxRate: number): BuyerInvoice[] {
  const rate = Number.isFinite(taxRate) ? taxRate : 0;
  const map = new Map<string, BuyerInvoice>();

  for (const l of lots.filter(isSold)) {
    const key = buyerKeyOf(l);
    if (!map.has(key)) {
      map.set(key, {
        key,
        buyerName: l.buyer?.name || 'Unknown buyer',
        buyer: l.buyer ?? {},
        lines: [],
        invoiceIds: [],
        hammerTotal: 0,
        premiumTotal: 0,
        taxRate: rate,
        tax: 0,
        total: 0,
        paidCount: 0,
        unpaidCount: 0,
        carriers: [],
      });
    }
    const inv = map.get(key)!;
    const paid = l.payment_status === 'paid';
    inv.lines.push({
      lotId: l.id,
      lotNumber: l.lot_number,
      name: l.name,
      hammer: l.sold_price ?? 0,
      premium: l.buyers_premium ?? 0,
      paid,
      carrier: l.fulfillment_carrier,
    });
    inv.hammerTotal += l.sold_price ?? 0;
    inv.premiumTotal += l.buyers_premium ?? 0;
    paid ? inv.paidCount++ : inv.unpaidCount++;
    if (l.la_invoice_id && !inv.invoiceIds.includes(l.la_invoice_id)) inv.invoiceIds.push(l.la_invoice_id);
    if (l.fulfillment_carrier && !inv.carriers.includes(l.fulfillment_carrier)) inv.carriers.push(l.fulfillment_carrier);
  }

  const lotNum = (v: number | string | undefined) =>
    typeof v === 'number' ? v : parseInt(String(v ?? ''), 10) || 0;

  return [...map.values()]
    .map((inv) => {
      inv.lines.sort((a, b) => lotNum(a.lotNumber) - lotNum(b.lotNumber));
      inv.hammerTotal = round2(inv.hammerTotal);
      inv.premiumTotal = round2(inv.premiumTotal);
      inv.tax = round2((inv.hammerTotal + inv.premiumTotal) * (rate / 100));
      inv.total = round2(inv.hammerTotal + inv.premiumTotal + inv.tax);
      return inv;
    })
    .sort((a, b) => a.buyerName.localeCompare(b.buyerName));
}

// ── Shared address formatting ────────────────────────────────────────────────

export function addressLines(b: LotBuyer): string[] {
  const cityLine = [b.city, b.state, b.zip].filter(Boolean).join(' ');
  return [b.address, cityLine, b.country && b.country !== 'US' ? b.country : '']
    .filter(Boolean) as string[];
}

export function addressOneLine(b: LotBuyer): string {
  return addressLines(b).join(', ');
}
