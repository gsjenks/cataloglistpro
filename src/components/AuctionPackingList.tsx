// src/components/AuctionPackingList.tsx
// Packing artifact #1 — the whole auction on one list: every sold lot with its
// name, buyer, address and shipper, sortable by lot / buyer / shipper. This is the
// master sheet you work the packing session from.

import { useMemo, useState } from 'react';
import { X, Printer } from 'lucide-react';
import type { Lot } from '../types';
import { addressOneLine, isSold } from '../lib/invoices';

interface Props {
  saleName: string;
  companyName?: string;
  lots: Lot[];
  carrierLabel: (value?: string) => string;
  onClose: () => void;
}

type SortKey = 'lot' | 'buyer' | 'shipper';

const money = (n?: number) => (n == null ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
const lotNum = (v: number | string | undefined) =>
  typeof v === 'number' ? v : parseInt(String(v ?? ''), 10) || 0;

export default function AuctionPackingList({ saleName, companyName, lots, carrierLabel, onClose }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('lot');
  const [unshippedOnly, setUnshippedOnly] = useState(false);

  const rows = useMemo(() => {
    const list = lots
      .filter(isSold)
      .filter((l) => (unshippedOnly ? !l.shipped_at && !l.delivered_at : true))
      .map((l) => ({
        lot: l,
        buyer: l.buyer?.name || 'Unknown buyer',
        address: addressOneLine(l.buyer ?? {}),
        shipper: carrierLabel(l.fulfillment_carrier),
      }));
    const byLot = (a: typeof list[number], b: typeof list[number]) =>
      lotNum(a.lot.lot_number) - lotNum(b.lot.lot_number);
    if (sortBy === 'buyer') list.sort((a, b) => a.buyer.localeCompare(b.buyer) || byLot(a, b));
    else if (sortBy === 'shipper') list.sort((a, b) => a.shipper.localeCompare(b.shipper) || a.buyer.localeCompare(b.buyer) || byLot(a, b));
    else list.sort(byLot);
    return list;
  }, [lots, sortBy, unshippedOnly, carrierLabel]);

  const unpaid = rows.filter((r) => r.lot.payment_status !== 'paid').length;
  const unassigned = rows.filter((r) => !r.lot.fulfillment_carrier).length;
  const printedAt = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #packlist-print, #packlist-print * { visibility: visible !important; }
        #packlist-print { position: absolute; inset: 0; margin: 0; box-shadow: none; max-height: none; overflow: visible; }
        .no-print { display: none !important; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
      }`}</style>

      <div id="packlist-print" className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-3 no-print">
          <h3 className="text-lg font-semibold text-gray-900">Auction packing list</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              Sort
              <select
                value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="border border-gray-300 rounded-md p-1 text-sm"
              >
                <option value="lot">Lot #</option>
                <option value="buyer">Buyer</option>
                <option value="shipper">Shipper</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox" checked={unshippedOnly}
                onChange={(e) => setUnshippedOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Still to pack
            </label>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-4 text-sm text-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Packing List</h2>
              <div className="text-gray-600 mt-1">{saleName}</div>
              {companyName && <div className="text-xs text-gray-500">{companyName}</div>}
              <div className="text-xs text-gray-400 mt-0.5">Prepared {printedAt}</div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div><span className="text-lg font-bold text-gray-900">{rows.length}</span> lot(s)</div>
              <div>sorted by {sortBy === 'lot' ? 'lot #' : sortBy}</div>
            </div>
          </div>

          {(unpaid > 0 || unassigned > 0) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {unpaid > 0 && <span>{unpaid} lot(s) not yet paid — don't release them. </span>}
              {unassigned > 0 && <span>{unassigned} lot(s) have no shipper assigned.</span>}
            </div>
          )}

          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-2 py-2 w-12">Lot</th>
                  <th className="text-left font-medium px-2 py-2">Item</th>
                  <th className="text-left font-medium px-2 py-2 w-40">Buyer</th>
                  <th className="text-left font-medium px-2 py-2">Address</th>
                  <th className="text-left font-medium px-2 py-2 w-28">Shipper</th>
                  <th className="text-right font-medium px-2 py-2 w-20">Price</th>
                  <th className="text-center font-medium px-2 py-2 w-10">✓</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ lot, buyer, address, shipper }) => (
                  <tr key={lot.id}>
                    <td className="px-2 py-1.5 text-gray-500">{lot.lot_number ?? ''}</td>
                    <td className="px-2 py-1.5">
                      {lot.name}
                      {lot.payment_status !== 'paid' && (
                        <span className="ml-1.5 text-xs font-medium text-amber-600">UNPAID</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">{buyer}</td>
                    <td className="px-2 py-1.5 text-gray-600 text-xs">{address || '—'}</td>
                    <td className="px-2 py-1.5 text-xs">
                      {lot.fulfillment_carrier ? shipper : <span className="text-amber-600">unassigned</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(lot.sold_price)}</td>
                    <td className="px-2 py-1.5">
                      <div className="mx-auto w-4 h-4 border border-gray-400 rounded-sm" />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                      {unshippedOnly ? 'Everything sold has been packed and handed off.' : 'No sold lots yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
