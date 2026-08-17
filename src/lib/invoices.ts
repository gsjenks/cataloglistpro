// src/lib/invoices.ts
// Pure buyer-invoice math for the packing session. Groups a sale's sold lots by
// buyer and totals hammer → buyer's premium → tax → amount due.
//
// Sales tax is NOT stored on the auction path (LiveAuctioneers collects and remits
// it), so the rate is supplied by the caller — 0 means "no tax line, LA handled it".
// Tax base is hammer + premium, the common auction convention.

import type { Lot, LotBuyer } from '../types';
import { isSoldLot } from './lotState';

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
  /** Earliest payment due date across this buyer's unpaid lots. */
  dueAt?: string;
  carriers: string[];        // distinct handoff values across the buyer's lots
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const buyerKeyOf = (l: Lot): string => {
  const b = l.buyer ?? {};
  return b.email || b.name || 'unknown';
};

// Re-exported so callers that already import from here keep working; the definition
// lives in lib/lotState.ts, which every money path now shares.
export const isSold = isSoldLot;

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
        dueAt: undefined,
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
    if (paid) inv.paidCount++;
    else {
      inv.unpaidCount++;
      if (l.payment_due_at && (!inv.dueAt || l.payment_due_at < inv.dueAt)) inv.dueAt = l.payment_due_at;
    }
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

// ── House-collected charges ──────────────────────────────────────────────────
// Shipping / handling / tax the house bills directly. Tax base is
// hammer + premium + shipping + handling (Georgia taxes shipping on a taxable sale).
// A resale certificate zeroes the tax but the base is still recorded.

export interface HouseTotals {
  shipping: number;
  handling: number;
  taxGoods: boolean;
  taxableBase: number;
  taxRate: number;
  tax: number;
  exempt: boolean;
  /** shipping + handling + tax — what the house collects on top of the lots. */
  charged: number;
}

export function computeHouseTotals(
  goods: number,                    // hammer + premium for this buyer's lots
  input: {
    shipping?: number; handling?: number; taxRate?: number; exempt?: boolean;
    /** Include the lots in the tax base. False when LiveAuctioneers already taxed
     *  them, leaving only the house's own shipping/handling taxable. */
    taxGoods?: boolean;
  },
): HouseTotals {
  const shipping = input.shipping ?? 0;
  const handling = input.handling ?? 0;
  const taxRate = input.taxRate ?? 0;
  const exempt = !!input.exempt;
  const taxGoods = input.taxGoods !== false;
  const taxableBase = round2((taxGoods ? goods : 0) + shipping + handling);
  const tax = exempt ? 0 : round2(taxableBase * (taxRate / 100));
  return {
    shipping,
    handling,
    taxGoods,
    taxableBase,
    taxRate,
    tax,
    exempt,
    charged: round2(shipping + handling + tax),
  };
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
