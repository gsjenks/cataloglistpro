// src/lib/reconciliation.ts
// Pure sale-level reconciliation math for Stage 7. Rolls every consignor's
// settlement (see lib/settlement.ts) up into one view of the sale: what the house
// earned, what it owes, what it has already paid out — plus the accounting CSV.
// No I/O. See docs/auction-lifecycle-spec.md §3 Stage 7.

import type { Consignment, Lot, HouseCharge, BuyerInvoiceRecord } from '../types';
import { computeSettlement, type Settlement } from './settlement';

export interface ConsignorRow {
  consignment: Consignment;
  name: string;
  settlement: Settlement;
  paid: boolean;
  paidAt?: string;
  method?: string;
  reference?: string;
  // What was actually recorded as paid, when it differs from today's computed net
  // (a lot changed after the check went out — worth surfacing, not hiding).
  recorded?: number;
  drifted: boolean;
}

export interface SaleReconciliation {
  rows: ConsignorRow[];
  // Lot counts
  lotCount: number;
  soldCount: number;
  unsoldCount: number;
  sellThrough: number;          // percent of lots sold
  unpaidSoldCount: number;      // sold lots that buyers haven't paid for yet
  unassignedSoldCount: number;  // sold lots with no consignor — not on any statement
  unassignedHammer: number;
  // Money
  grossHammer: number;          // Σ hammer, every sold lot in the sale
  buyersPremium: number;        // Σ buyer's premium, house revenue
  commission: number;           // Σ per-consignor commission
  feesCharged: number;          // Σ per-consignor fees (incl. buy-in)
  // Charges the house billed buyers directly. Shipping and handling are revenue
  // (less whatever the shipper costs, which the app doesn't track).
  houseShipping: number;
  houseRevenue: number;         // commission + buyer's premium + fees + house shipping/handling
  // Sales tax the house collected is NOT revenue — it is money held for the state.
  // Kept out of houseRevenue deliberately and reported on its own.
  taxLiability: number;
  taxCollectedCount: number;    // buyers charged house tax
  exemptCount: number;          // buyers billed tax-exempt (resale certificates)
  // Collected by LiveAuctioneers, never touching the house's books. Informational
  // only, so the totals here can be reconciled against LA's own statement.
  laTaxCollected: number;
  laShippingCollected: number;
  payoutsDue: number;           // Σ consignor net
  paidOut: number;              // Σ net of consignors already paid
  outstanding: number;          // payoutsDue − paidOut
  paidCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeReconciliation(
  consignments: Consignment[],
  lots: Lot[],
  consignorNames: Record<string, string>,
  houseCharges: HouseCharge[] = [],
  laInvoices: BuyerInvoiceRecord[] = [],
): SaleReconciliation {
  const rows: ConsignorRow[] = consignments
    .map((c) => {
      const settlement = computeSettlement(c, lots);
      const recorded = c.net_due;
      return {
        consignment: c,
        name: consignorNames[c.id] || 'Unnamed consignor',
        settlement,
        paid: !!c.paid_at,
        paidAt: c.paid_at,
        method: c.payment_method,
        reference: c.payment_reference,
        recorded,
        drifted: !!c.paid_at && recorded != null && Math.abs(recorded - settlement.net) >= 0.01,
      };
    })
    .sort((a, b) => b.settlement.net - a.settlement.net);

  const isSold = (l: Lot) => l.outcome === 'sold' || (l.sold_price ?? 0) > 0;
  const sold = lots.filter(isSold);
  const unassignedSold = sold.filter((l) => !l.consignment_id);

  const grossHammer = sold.reduce((s, l) => s + (l.sold_price ?? 0), 0);
  const buyersPremium = sold.reduce((s, l) => s + (l.buyers_premium ?? 0), 0);
  const commission = rows.reduce((s, r) => s + r.settlement.commission, 0);
  const feesCharged = rows.reduce((s, r) => s + r.settlement.feesTotal, 0);
  const houseShipping = houseCharges.reduce((s, c) => s + (c.shipping ?? 0) + (c.handling ?? 0), 0);
  const taxLiability = houseCharges.reduce((s, c) => s + (c.tax ?? 0), 0);
  const payoutsDue = rows.reduce((s, r) => s + r.settlement.net, 0);
  const paidRows = rows.filter((r) => r.paid);
  const paidOut = paidRows.reduce((s, r) => s + (r.recorded ?? r.settlement.net), 0);

  return {
    rows,
    lotCount: lots.length,
    soldCount: sold.length,
    unsoldCount: lots.length - sold.length,
    sellThrough: lots.length ? round2((sold.length / lots.length) * 100) : 0,
    unpaidSoldCount: sold.filter((l) => (l.payment_status ?? 'unpaid') !== 'paid').length,
    unassignedSoldCount: unassignedSold.length,
    unassignedHammer: round2(unassignedSold.reduce((s, l) => s + (l.sold_price ?? 0), 0)),
    grossHammer: round2(grossHammer),
    buyersPremium: round2(buyersPremium),
    commission: round2(commission),
    feesCharged: round2(feesCharged),
    houseShipping: round2(houseShipping),
    houseRevenue: round2(commission + buyersPremium + feesCharged + houseShipping),
    taxLiability: round2(taxLiability),
    taxCollectedCount: houseCharges.filter((c) => (c.tax ?? 0) > 0).length,
    exemptCount: houseCharges.filter((c) => c.tax_exempt).length,
    laTaxCollected: round2(laInvoices.reduce((s, i) => s + (i.sales_tax ?? 0), 0)),
    laShippingCollected: round2(laInvoices.reduce((s, i) => s + (i.shipping ?? 0), 0)),
    payoutsDue: round2(payoutsDue),
    paidOut: round2(paidOut),
    outstanding: round2(payoutsDue - paidOut),
    paidCount: paidRows.length,
  };
}

// ── Accounting export ────────────────────────────────────────────────────────

const csvCell = (v: string | number | undefined): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csvRow = (cells: (string | number | undefined)[]) => cells.map(csvCell).join(',');

const day = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

// One CSV: a payout line per consignor, then the house-revenue summary. Import
// target is a bookkeeper's spreadsheet, so it stays human-readable.
export function buildAccountingCsv(saleName: string, recon: SaleReconciliation): string {
  const lines: string[] = [];

  lines.push(csvRow(['Consignor payouts']));
  lines.push(csvRow([
    'Sale', 'Consignor', 'Sold lots', 'Gross hammer', 'Commission rate %', 'Commission',
    'Fees', 'Net payout', 'Status', 'Paid on', 'Method', 'Reference', 'Amount paid',
  ]));
  recon.rows.forEach((r) => {
    const s = r.settlement;
    lines.push(csvRow([
      saleName, r.name, s.soldCount, round2(s.gross), s.commissionRate, round2(s.commission),
      round2(s.feesTotal), s.net, r.paid ? 'Paid' : 'Unpaid', day(r.paidAt), r.method ?? '',
      r.reference ?? '', r.paid ? (r.recorded ?? s.net) : '',
    ]));
  });

  lines.push('');
  lines.push(csvRow(['Sale summary']));
  lines.push(csvRow(['Item', 'Amount']));
  lines.push(csvRow(['Gross hammer', recon.grossHammer]));
  lines.push(csvRow(["Buyer's premium (house)", recon.buyersPremium]));
  lines.push(csvRow(['Commission (house)', recon.commission]));
  lines.push(csvRow(['Fees billed to consignors (house)', recon.feesCharged]));
  lines.push(csvRow(['Shipping & handling billed in-house', recon.houseShipping]));
  lines.push(csvRow(['House revenue', recon.houseRevenue]));
  lines.push('');
  lines.push(csvRow(['Held for others — NOT revenue']));
  lines.push(csvRow(['Sales tax collected in-house (remit to state)', recon.taxLiability]));
  lines.push('');
  lines.push(csvRow(['Collected by LiveAuctioneers — not house funds']));
  lines.push(csvRow(['Sales tax', recon.laTaxCollected]));
  lines.push(csvRow(['Shipping', recon.laShippingCollected]));
  lines.push('');
  lines.push(csvRow(['Consignor settlement']));
  lines.push(csvRow(['Consignor payouts due', recon.payoutsDue]));
  lines.push(csvRow(['Consignor payouts made', recon.paidOut]));
  lines.push(csvRow(['Outstanding to consignors', recon.outstanding]));
  lines.push(csvRow(['Lots sold / total', `${recon.soldCount} / ${recon.lotCount}`]));
  lines.push(csvRow(['Sell-through %', recon.sellThrough]));
  if (recon.unassignedSoldCount > 0) {
    lines.push(csvRow(['Sold lots with no consignor', recon.unassignedSoldCount]));
    lines.push(csvRow(['Hammer not on any statement', recon.unassignedHammer]));
  }

  return lines.join('\r\n');
}

export function downloadAccountingCsv(saleName: string, recon: SaleReconciliation): void {
  const csv = buildAccountingCsv(saleName, recon);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safe = saleName.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'sale';
  link.setAttribute('href', url);
  link.setAttribute('download', `${safe}_reconciliation.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
