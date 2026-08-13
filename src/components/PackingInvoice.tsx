// src/components/PackingInvoice.tsx
// Stage 6 — printable packing invoice for one shipment (a buyer's paid lots via a
// shipper/handoff), with a signature + date/time block to confirm pickup/handoff.

import { X, Printer } from 'lucide-react';
import type { Lot, LotBuyer } from '../types';

interface Props {
  saleName: string;
  buyerName: string;
  buyer: LotBuyer;
  handoffLabel: string;
  lots: Lot[];
  onClose: () => void;
}

const money = (n?: number) => (n == null ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

function addressLines(b: LotBuyer): string[] {
  const cityLine = [b.city, b.state, b.zip].filter(Boolean).join(' ');
  return [b.address, cityLine, b.country && b.country !== 'US' ? b.country : ''].filter(Boolean) as string[];
}

export default function PackingInvoice({ saleName, buyerName, buyer, handoffLabel, lots, onClose }: Props) {
  const total = lots.reduce((s, l) => s + (l.sold_price ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <style>{`@media print { body * { visibility: hidden !important; } #packing-print, #packing-print * { visibility: visible !important; } #packing-print { position: absolute; inset: 0; margin: 0; box-shadow: none; max-height: none; overflow: visible; } .no-print { display: none !important; } }`}</style>

      <div id="packing-print" className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between no-print">
          <h3 className="text-lg font-semibold text-gray-900">Packing invoice</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-5 text-sm text-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Packing Invoice</h2>
              <div className="text-gray-600 mt-1">{saleName}</div>
            </div>
            <div className="text-right text-gray-600">
              <div className="text-xs uppercase tracking-wide text-gray-400">Handoff</div>
              <div className="font-medium text-gray-900">{handoffLabel}</div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Ship to</div>
            <div className="font-medium text-gray-900">{buyerName}</div>
            {addressLines(buyer).map((line, i) => <div key={i} className="text-gray-700">{line}</div>)}
            {buyer.phone && <div className="text-gray-600">{buyer.phone}</div>}
            {buyer.email && <div className="text-gray-600">{buyer.email}</div>}
          </div>

          <div className="border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-16">Lot</th>
                  <th className="text-left font-medium px-3 py-2">Item</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-1.5 text-gray-500">{l.lot_number ?? ''}</td>
                    <td className="px-3 py-1.5">{l.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(l.sold_price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300">
                  <td colSpan={2} className="px-3 py-2 text-right font-medium text-gray-700">{lots.length} item(s) · Total</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signature / handoff confirmation */}
          <div className="pt-6">
            <div className="text-xs uppercase tracking-wide text-gray-400 mb-4">Received / picked up — confirmation</div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-8">
              <SignLine label="Received by (print name)" />
              <SignLine label="Signature" />
              <SignLine label="Date" />
              <SignLine label="Time" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignLine({ label }: { label: string }) {
  return (
    <div>
      <div className="border-b border-gray-400 h-8" />
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
