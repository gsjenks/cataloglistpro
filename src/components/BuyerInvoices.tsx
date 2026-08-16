// src/components/BuyerInvoices.tsx
// Packing artifact #2 — the financial invoice for a buyer: every lot they won,
// hammer + buyer's premium + tax, amount due. Prints one invoice per page for the
// whole sale, or a single buyer's when opened from their row.
//
// Sales tax isn't stored on the LiveAuctioneers path (LA collects it), so the rate
// is entered here and remembered per sale — same convention the POS uses.

import { useMemo, useState } from 'react';
import { X, Printer } from 'lucide-react';
import type { Lot } from '../types';
import { buildBuyerInvoices, addressLines, type BuyerInvoice } from '../lib/invoices';

interface Props {
  saleId: string;
  saleName: string;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  lots: Lot[];
  buyerKey?: string;                       // limit to one buyer
  carrierLabel: (value?: string) => string;
  onClose: () => void;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const taxKey = (saleId: string) => `invoice_taxrate_${saleId}`;

export default function BuyerInvoices({
  saleId, saleName, companyName, companyPhone, companyAddress, lots, buyerKey, carrierLabel, onClose,
}: Props) {
  const [taxRate, setTaxRate] = useState<string>(() => localStorage.getItem(taxKey(saleId)) ?? '0');
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  const rate = parseFloat(taxRate) || 0;
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

  const grand = invoices.reduce((s, i) => s + i.total, 0);

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
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              Tax %
              <input
                type="number" inputMode="decimal" value={taxRate}
                onChange={(e) => setRate(e.target.value)}
                className="w-16 border border-gray-300 rounded-md p-1 text-sm"
              />
            </label>
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
  inv, saleName, companyName, companyPhone, companyAddress, carrierLabel,
}: {
  inv: BuyerInvoice;
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
        {inv.taxRate > 0 ? (
          <Row label={`Sales tax (${inv.taxRate}%)`} value={money(inv.tax)} />
        ) : (
          <Row label="Sales tax" value="collected by LiveAuctioneers" muted />
        )}
        <div className="border-t border-gray-300 pt-2 mt-2 flex items-center justify-between">
          <span className="font-semibold text-gray-900">Total</span>
          <span className="font-bold text-lg text-gray-900 tabular-nums">{money(inv.total)}</span>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Shipping and handling, if any, are billed separately by the shipper.
      </p>
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
