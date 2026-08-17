// src/components/SettlementStatement.tsx
// D6 — per-consignor settlement statement. Shows sold-lot line items and the
// gross → commission → fees → net breakdown, printable. See src/lib/settlement.ts.

import { X, Printer } from 'lucide-react';
import type { Consignment, Lot } from '../types';
import { computeSettlement } from '../lib/settlement';

interface Props {
  consignment: Consignment;
  consignorName: string;
  saleName: string;
  lots: Lot[];
  onClose: () => void;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function SettlementStatement({ consignment, consignorName, saleName, lots, onClose }: Props) {
  const s = computeSettlement(consignment, lots);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {/* Print isolation: show only the statement when printing. */}
      <style>{`@media print { body * { visibility: hidden !important; } #settlement-print, #settlement-print * { visibility: visible !important; } #settlement-print { position: absolute; inset: 0; margin: 0; box-shadow: none; max-height: none; overflow: visible; } .no-print { display: none !important; } }`}</style>

      <div id="settlement-print" className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between no-print">
          <h3 className="text-lg font-semibold text-gray-900">Settlement statement</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 text-sm text-gray-800">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Consignor Settlement</h2>
            <div className="mt-1 text-gray-600">
              <div><span className="font-medium text-gray-900">{consignorName}</span></div>
              <div>{saleName}</div>
            </div>
          </div>

          {/* Sold-lot line items */}
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-16">Lot</th>
                  <th className="text-left font-medium px-3 py-2">Item</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Hammer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {s.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-500">{l.lotNumber ?? ''}</td>
                    <td className="px-3 py-1.5">{l.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(l.hammer)}</td>
                  </tr>
                ))}
                {s.lines.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-gray-400">
                      No sold lots for this consignor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="ml-auto w-full max-w-sm space-y-1.5">
            <Row label={`Gross (${s.soldCount} sold)`} value={money(s.gross)} />
            <Row label={`Commission (${s.commissionRate}%)`} value={`− ${money(s.commission)}`} />
            {s.fees.map((f, i) => (
              <Row key={`${f.key}-${i}`} label={`${f.label}${f.note ? ` (${f.note})` : ''} fee`} value={`− ${money(f.amount)}`} />
            ))}
            {s.fees.length === 0 && <Row label="Fees" value={money(0)} muted />}
            <div className="border-t border-gray-300 pt-2 mt-2 flex items-center justify-between">
              <span className="font-semibold text-gray-900">Net payout</span>
              <span className="font-bold text-lg text-gray-900 tabular-nums">{money(s.net)}</span>
            </div>
          </div>

          {/* Unsold lots — buy-in is charged on those with a reserve */}
          {s.unsoldLots.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Unsold lots ({s.unsoldLots.length}) — buy-in {s.buyinRate}% of reserve
              </h3>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left font-medium px-3 py-2 w-16">Lot</th>
                      <th className="text-left font-medium px-3 py-2">Item</th>
                      <th className="text-right font-medium px-3 py-2 w-24">Reserve</th>
                      <th className="text-right font-medium px-3 py-2 w-24">Buy-in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.unsoldLots.map((u, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-500">{u.lotNumber ?? ''}</td>
                        <td className="px-3 py-1.5">{u.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {u.reserve && u.reserve > 0
                            ? money(u.reserve)
                            : <span className="text-gray-300">no reserve</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {u.buyinCharge > 0 ? money(u.buyinCharge) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Buyer's premium is retained by the auction house and is not part of this settlement.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-gray-400' : 'text-gray-600'}>{label}</span>
      <span className="tabular-nums text-gray-900">{value}</span>
    </div>
  );
}
