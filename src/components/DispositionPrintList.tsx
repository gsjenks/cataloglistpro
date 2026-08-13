// src/components/DispositionPrintList.tsx
// D5 — printable list of dispositioned lots for records (charity donation receipt,
// items returned to the consignor). Print CSS isolates the list.

import { X, Printer } from 'lucide-react';
import type { Lot } from '../types';

interface Props {
  title: string;
  saleName: string;
  consignorName?: string;
  lots: Lot[];
  onClose: () => void;
}

const money = (n?: number) => (n == null ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

function estimateText(l: Lot): string {
  if (l.estimate_low && l.estimate_high) return `${money(l.estimate_low)} – ${money(l.estimate_high)}`;
  if (l.estimate_low) return money(l.estimate_low);
  return '';
}

export default function DispositionPrintList({ title, saleName, consignorName, lots, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <style>{`@media print { body * { visibility: hidden !important; } #disp-print, #disp-print * { visibility: visible !important; } #disp-print { position: absolute; inset: 0; margin: 0; box-shadow: none; max-height: none; overflow: visible; } .no-print { display: none !important; } }`}</style>

      <div id="disp-print" className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between no-print">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 text-sm text-gray-800">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <div className="text-gray-600 mt-1">
              <div>{saleName}</div>
              {consignorName && <div>Consignor: {consignorName}</div>}
              <div>{lots.length} item(s)</div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-16">Lot</th>
                  <th className="text-left font-medium px-3 py-2">Item</th>
                  <th className="text-right font-medium px-3 py-2 w-40">Est. value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-1.5 text-gray-500">{l.lot_number ?? ''}</td>
                    <td className="px-3 py-1.5">{l.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{estimateText(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            Estimated values are pre-sale catalogue estimates, provided for reference only.
          </p>
        </div>
      </div>
    </div>
  );
}
