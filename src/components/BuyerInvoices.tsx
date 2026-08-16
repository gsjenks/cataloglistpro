// src/components/BuyerInvoices.tsx
// Packing artifact #2 — the financial invoice for a buyer: every lot they won,
// hammer + buyer's premium + tax, amount due. Prints one invoice per page for the
// whole sale, or a single buyer's when opened from their row.
//
// Sales tax isn't stored on the LiveAuctioneers path (LA collects it), so the rate
// is entered here and remembered per sale — same convention the POS uses.

import { useMemo, useState } from 'react';
import { X, Printer } from 'lucide-react';
import type { Lot, BuyerInvoiceRecord, HouseCharge } from '../types';
import { buildBuyerInvoices, addressLines, isSold, type BuyerInvoice } from '../lib/invoices';

interface Props {
  saleId: string;
  saleName: string;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  lots: Lot[];
  /** Invoices imported from the LA PDF — authoritative for tax, shipping and balance. */
  laInvoices?: BuyerInvoiceRecord[];
  /** Shipping / handling / tax the house bills directly, per buyer. */
  houseCharges?: HouseCharge[];
  buyerKey?: string;                       // limit to one buyer
  carrierLabel: (value?: string) => string;
  onClose: () => void;
}

// A lot LiveAuctioneers billed on this invoice that is no longer a completed sale to
// this buyer — they never paid for it, or it came back. It is credited at LA's own
// figures, plus that lot's share of the invoice's sales tax.
interface CreditLine {
  invoiceId: string;
  lotNumber: number;
  title: string;
  goods: number;   // hammer + premium as billed
  tax: number;     // proportional share of the invoice's sales tax
  total: number;
}

// LA's own figures for a buyer, summed when their lots span more than one invoice.
interface LaTotals {
  ids: string[];
  shipping: number;
  onlineFee: number;
  salesTax: number;
  total: number;         // as LA billed
  balanceDue: number;
  flagged: boolean;
  credits: CreditLine[];
  creditTotal: number;
  adjustedTotal: number; // what the buyer actually owes once credits are applied
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function laTotalsFor(
  inv: BuyerInvoice,
  byId: Map<string, BuyerInvoiceRecord>,
  soldLotNumbers: Set<number>,
): LaTotals | null {
  const matches = inv.invoiceIds.map((id) => byId.get(id)).filter((r): r is BuyerInvoiceRecord => !!r);
  if (matches.length === 0) return null;

  // Anything LA billed that this buyer no longer holds as a completed sale.
  const credits: CreditLine[] = [];
  for (const m of matches) {
    const billed = m.lines ?? [];
    const billedGoods = billed.reduce((s, l) => s + (l.price ?? 0), 0);
    for (const line of billed) {
      if (soldLotNumbers.has(line.lotNumber)) continue;
      const goods = line.price ?? (line.hammer ?? 0) + (line.premium ?? 0);
      // LA taxes the goods, so the credit carries that lot's share of the tax.
      const tax = billedGoods > 0 ? round2(((m.sales_tax ?? 0) * goods) / billedGoods) : 0;
      credits.push({
        invoiceId: m.la_invoice_id,
        lotNumber: line.lotNumber,
        title: line.title,
        goods: round2(goods),
        tax,
        total: round2(goods + tax),
      });
    }
  }

  const total = matches.reduce((s, m) => s + (m.total ?? 0), 0);
  const creditTotal = round2(credits.reduce((s, c) => s + c.total, 0));

  return {
    ids: matches.map((m) => m.la_invoice_id),
    shipping: matches.reduce((s, m) => s + (m.shipping ?? 0), 0),
    onlineFee: matches.reduce((s, m) => s + (m.online_fee ?? 0), 0),
    salesTax: matches.reduce((s, m) => s + (m.sales_tax ?? 0), 0),
    total: round2(total),
    balanceDue: matches.reduce((s, m) => s + (m.balance_due ?? 0), 0),
    flagged: matches.some((m) => m.totals_balance === false),
    credits,
    creditTotal,
    adjustedTotal: round2(total - creditTotal),
  };
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const taxKey = (saleId: string) => `invoice_taxrate_${saleId}`;

export default function BuyerInvoices({
  saleId, saleName, companyName, companyPhone, companyAddress, lots, laInvoices, houseCharges,
  buyerKey, carrierLabel, onClose,
}: Props) {
  const [taxRate, setTaxRate] = useState<string>(() => localStorage.getItem(taxKey(saleId)) ?? '0');
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  const rate = parseFloat(taxRate) || 0;
  const laById = useMemo(
    () => new Map((laInvoices ?? []).map((r) => [r.la_invoice_id, r])),
    [laInvoices],
  );
  const invoices = useMemo(() => {
    let list = buildBuyerInvoices(lots, rate);
    if (buyerKey) list = list.filter((i) => i.key === buyerKey);
    if (unpaidOnly) list = list.filter((i) => i.unpaidCount > 0);
    return list;
  }, [lots, rate, buyerKey, unpaidOnly]);

  const setRate = (v: string) => {
    setTaxRate(v);
    localStorage.setItem(taxKey(saleId), v);
  };

  const houseByBuyer = useMemo(
    () => new Map((houseCharges ?? []).map((c) => [c.buyer_key, c])),
    [houseCharges],
  );
  // Lot numbers still standing as completed sales, so anything LA billed that isn't
  // here any more shows up as a credit rather than silently inflating the invoice.
  const soldLotNumbers = useMemo(
    () => new Set(
      lots.filter(isSold)
        .map((l) => (typeof l.lot_number === 'number' ? l.lot_number : parseInt(String(l.lot_number ?? ''), 10)))
        .filter((n) => Number.isFinite(n)),
    ),
    [lots],
  );
  const laFor = (inv: BuyerInvoice) => laTotalsFor(inv, laById, soldLotNumbers);
  const houseFor = (inv: BuyerInvoice) => houseByBuyer.get(inv.key) ?? null;
  const houseAdds = (c: HouseCharge | null) =>
    c ? (c.shipping ?? 0) + (c.handling ?? 0) + (c.tax ?? 0) : 0;
  const grand = invoices.reduce(
    (s, i) => s + (laFor(i)?.adjustedTotal ?? i.total) + houseAdds(houseFor(i)),
    0,
  );
  // The typed rate is only a fallback for buyers with no imported LA invoice.
  const needsFallbackTax = invoices.some((i) => !laFor(i));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #invoices-print, #invoices-print * { visibility: visible !important; }
        #invoices-print { position: absolute; inset: 0; margin: 0; box-shadow: none; max-height: none; overflow: visible; }
        .no-print { display: none !important; }
        .invoice-page { break-after: page; page-break-after: always; }
        .invoice-page:last-child { break-after: auto; page-break-after: auto; }
      }`}</style>

      <div id="invoices-print" className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-3 no-print">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {buyerKey ? 'Buyer invoice' : 'Buyer invoices'}
            </h3>
            <p className="text-xs text-gray-500">
              {invoices.length} invoice(s) · {money(grand)}{!buyerKey && ' · one per page'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {needsFallbackTax && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600" title="Only applied to buyers with no imported LiveAuctioneers invoice">
                Tax %
                <input
                  type="number" inputMode="decimal" value={taxRate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-16 border border-gray-300 rounded-md p-1 text-sm"
                />
              </label>
            )}
            {!buyerKey && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox" checked={unpaidOnly}
                  onChange={(e) => setUnpaidOnly(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Unpaid only
              </label>
            )}
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {invoices.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No sold lots to invoice.</p>
        ) : (
          <div>
            {invoices.map((inv) => (
              <Invoice
                key={inv.key}
                inv={inv}
                la={laFor(inv)}
                house={houseFor(inv)}
                saleName={saleName}
                companyName={companyName}
                companyPhone={companyPhone}
                companyAddress={companyAddress}
                carrierLabel={carrierLabel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Invoice({
  inv, la, house, saleName, companyName, companyPhone, companyAddress, carrierLabel,
}: {
  inv: BuyerInvoice;
  la: LaTotals | null;
  house: HouseCharge | null;
  saleName: string;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  carrierLabel: (value?: string) => string;
}) {
  const fullyPaid = inv.unpaidCount === 0;
  return (
    <div className="invoice-page p-6 space-y-5 text-sm text-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{companyName || 'Invoice'}</h2>
          {companyAddress && <div className="text-xs text-gray-600">{companyAddress}</div>}
          {companyPhone && <div className="text-xs text-gray-600">{companyPhone}</div>}
          <div className="text-gray-600 mt-2">{saleName}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-gray-400">Invoice</div>
          {inv.invoiceIds.length > 0 && (
            <div className="font-medium text-gray-900">{inv.invoiceIds.join(', ')}</div>
          )}
          <div className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
            fullyPaid ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {fullyPaid ? 'Paid in full' : `${inv.unpaidCount} lot(s) unpaid`}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-gray-400">Bill to</div>
        <div className="font-medium text-gray-900">{inv.buyerName}</div>
        {addressLines(inv.buyer).map((line, i) => <div key={i} className="text-gray-700">{line}</div>)}
        {inv.buyer.phone && <div className="text-gray-600">{inv.buyer.phone}</div>}
        {inv.buyer.email && <div className="text-gray-600">{inv.buyer.email}</div>}
        {inv.carriers.length > 0 && (
          <div className="text-gray-600 mt-1">
            Handoff: {inv.carriers.map((c) => carrierLabel(c)).join(', ')}
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left font-medium px-3 py-2 w-14">Lot</th>
              <th className="text-left font-medium px-3 py-2">Item</th>
              <th className="text-right font-medium px-3 py-2 w-24">Hammer</th>
              <th className="text-right font-medium px-3 py-2 w-24">Premium</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {inv.lines.map((l) => (
              <tr key={l.lotId}>
                <td className="px-3 py-1.5 text-gray-500">{l.lotNumber ?? ''}</td>
                <td className="px-3 py-1.5">
                  {l.name}
                  {!l.paid && <span className="ml-2 text-xs text-amber-600">unpaid</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(l.hammer)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {l.premium ? money(l.premium) : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-sm space-y-1.5">
        <Row label={`Hammer (${inv.lines.length} lot${inv.lines.length === 1 ? '' : 's'})`} value={money(inv.hammerTotal)} />
        <Row label="Buyer's premium" value={money(inv.premiumTotal)} />
        {la ? (
          <>
            {la.shipping > 0 && <Row label="Shipping" value={money(la.shipping)} />}
            {la.onlineFee > 0 && <Row label="Online payments fee" value={money(la.onlineFee)} />}
            <Row label="Sales tax" value={money(la.salesTax)} />
            <div className={`border-t border-gray-300 pt-2 mt-2 flex items-center justify-between ${
              la.credits.length > 0 ? 'text-gray-500' : ''
            }`}>
              <span className={la.credits.length > 0 ? '' : 'font-semibold text-gray-900'}>
                {la.credits.length > 0 ? 'Invoiced by LiveAuctioneers' : 'Total'}
              </span>
              <span className={`tabular-nums ${la.credits.length > 0 ? '' : 'font-bold text-lg text-gray-900'}`}>
                {money(la.total)}
              </span>
            </div>

            {/* A lot that fell off this invoice after it was issued. */}
            {la.credits.map((c) => (
              <div key={`${c.invoiceId}-${c.lotNumber}`} className="flex items-start justify-between text-amber-700">
                <span className="text-sm pr-2">
                  Less lot {c.lotNumber} — not completed
                  <span className="block text-xs text-amber-600">
                    {c.title}{c.tax > 0 && ` · incl. ${money(c.tax)} tax`}
                  </span>
                </span>
                <span className="tabular-nums shrink-0">− {money(c.total)}</span>
              </div>
            ))}

            {la.credits.length > 0 && (
              <div className="border-t border-gray-300 pt-2 mt-2 flex items-center justify-between">
                <span className="font-semibold text-gray-900">Adjusted total</span>
                <span className="font-bold text-lg text-gray-900 tabular-nums">{money(la.adjustedTotal)}</span>
              </div>
            )}

            {la.balanceDue > 0 && (
              <div className="flex items-center justify-between text-amber-700">
                <span className="font-medium">Balance due</span>
                <span className="font-bold tabular-nums">{money(la.balanceDue)}</span>
              </div>
            )}
          </>
        ) : (
          <>
            {house ? (
              // Tax is billed by the house below; don't also guess at one here.
              <Row label="Subtotal" value={money(inv.hammerTotal + inv.premiumTotal)} />
            ) : inv.taxRate > 0 ? (
              <Row label={`Sales tax (${inv.taxRate}%)`} value={money(inv.tax)} />
            ) : (
              <Row label="Sales tax" value="collected by LiveAuctioneers" muted />
            )}
            {!house && (
              <div className="border-t border-gray-300 pt-2 mt-2 flex items-center justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-lg text-gray-900 tabular-nums">{money(inv.total)}</span>
              </div>
            )}
          </>
        )}

        {/* Anything the auction house bills directly — house-shipped lots and
            post-sale purchases, neither of which LiveAuctioneers invoices. */}
        {house && (
          <>
            <div className="border-t border-gray-200 pt-2 mt-2 text-xs uppercase tracking-wide text-gray-400">
              Collected by {companyName || 'the auction house'}
            </div>
            {(house.shipping ?? 0) > 0 && <Row label="Shipping" value={money(house.shipping)} />}
            {(house.handling ?? 0) > 0 && <Row label="Handling" value={money(house.handling)} />}
            {house.tax_exempt ? (
              <Row
                label="Sales tax — exempt"
                value={house.exempt_reason || 'certificate on file'}
                muted
              />
            ) : (
              <Row label={`Sales tax (${house.tax_rate ?? 0}%)`} value={money(house.tax ?? 0)} />
            )}
            <div className="border-t border-gray-300 pt-2 mt-2 flex items-center justify-between">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="font-bold text-lg text-gray-900 tabular-nums">
                {money((la?.total ?? inv.hammerTotal + inv.premiumTotal)
                  + (house.shipping ?? 0) + (house.handling ?? 0) + (house.tax ?? 0))}
              </span>
            </div>
            {house.collected_at && (
              <div className="flex items-center justify-between text-xs text-green-700">
                <span>House charges collected{house.payment_method ? ` (${house.payment_method})` : ''}</span>
                <span className="tabular-nums">{money((house.shipping ?? 0) + (house.handling ?? 0) + (house.tax ?? 0))}</span>
              </div>
            )}
          </>
        )}
      </div>

      {la ? (
        <p className="text-xs text-gray-400">
          Figures from LiveAuctioneers invoice #{la.ids.join(', #')}.
          {la.credits.length > 0 && ` ${la.credits.length} lot(s) billed on it did not complete and are credited above — settle the difference with LiveAuctioneers.`}
          {house && (
            house.tax_includes_goods === false
              ? ` Shipping, handling and tax on those charges billed by ${companyName || 'the auction house'}; the lots were taxed by LiveAuctioneers.`
              : ` Shipping, handling and sales tax billed by ${companyName || 'the auction house'}.`
          )}
          {la.flagged && ' That invoice’s printed total doesn’t equal its lines — check it against LA before sending.'}
        </p>
      ) : house ? (
        <p className="text-xs text-gray-400">
          Shipping, handling and sales tax billed by {companyName || 'the auction house'};
          tax charged on the goods plus shipping and handling.
        </p>
      ) : (
        <p className="text-xs text-gray-400">
          Totals computed from this sale's data — no LiveAuctioneers invoice imported for this buyer.
          Shipping and handling, if any, are billed separately by the shipper.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-gray-400' : 'text-gray-600'}>{label}</span>
      <span className={`tabular-nums ${muted ? 'text-gray-400 text-xs' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}
