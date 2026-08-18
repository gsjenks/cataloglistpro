// src/components/DeliveryMoverManifest.tsx
// Printable handoff manifest for ONE estate delivery — the sheet a mover signs at
// pickup. Lists the items, the delivery address, and the mover, with a signature
// block: driver name + signature, date, and time of pickup.

import { X, Printer } from 'lucide-react';

interface ManifestLot { id: string; lot_number?: number | string | null; name: string; sold_price?: number | null }

interface Props {
  saleName: string;
  buyer: string | null;
  address: string | null;
  date: string | null;
  estimate: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  lots: ManifestLot[];
  total: number;
  onClose: () => void;
}

const money = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function SignLine({ label }: { label: string }) {
  return (
    <div>
      <div className="border-b border-gray-400 h-8" />
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function DeliveryMoverManifest({
  saleName, buyer, address, date, estimate, company, phone, email, lots, total, onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <style>{`@media print { body * { visibility: hidden !important; } #delivery-manifest, #delivery-manifest * { visibility: visible !important; } #delivery-manifest { position: absolute; inset: 0; margin: 0; box-shadow: none; max-height: none; overflow: visible; } .no-print { display: none !important; } .sign-block { break-inside: avoid; page-break-inside: avoid; } }`}</style>

      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between no-print">
          <h3 className="text-lg font-semibold text-gray-900">Delivery manifest</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div id="delivery-manifest" className="p-6">
          <div className="border-b border-gray-200 pb-3 mb-3">
            <h2 className="text-xl font-bold text-gray-900">Delivery Manifest</h2>
            <p className="text-sm text-gray-500">{saleName}</p>
          </div>

          {/* Who + where + mover */}
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Deliver to</p>
              <p className="font-medium text-gray-900">{buyer || '—'}</p>
              <p className="text-gray-700 whitespace-pre-line">{address || 'No address on file'}</p>
              {date && <p className="text-gray-700 mt-1">{date}</p>}
              {estimate && <p className="text-gray-700 mt-1"><span className="text-gray-500">Moving Estimate:</span> {estimate}</p>}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Mover / delivery company</p>
              <p className="font-medium text-gray-900">{company || 'No mover on file'}</p>
              {phone && <p className="text-gray-700">{phone}</p>}
              {email && <p className="text-gray-700">{email}</p>}
            </div>
          </div>

          {/* Items */}
          <div className="mt-4 border border-gray-300 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-12">Load</th>
                  <th className="text-left font-medium px-3 py-2 w-14">Lot</th>
                  <th className="text-left font-medium px-3 py-2">Item</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2"><span className="inline-block w-4 h-4 border border-gray-400 rounded-sm" /></td>
                    <td className="px-3 py-2 text-gray-500">{l.lot_number ?? '—'}</td>
                    <td className="px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(l.sold_price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300">
                  <td colSpan={3} className="px-3 py-2 text-right font-medium text-gray-700">{lots.length} item{lots.length === 1 ? '' : 's'} · declared value</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signature / pickup */}
          <div className="sign-block pt-6">
            <p className="text-xs text-gray-600">
              The undersigned driver confirms pickup of the {lots.length} item(s) listed above,
              in the condition noted, for delivery to the address shown.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-8 mt-5">
              <SignLine label="Driver — print name" />
              <SignLine label="Driver signature" />
              <SignLine label="Date of pickup" />
              <SignLine label="Time of pickup" />
              <SignLine label="Released by (staff)" />
              <SignLine label="Exceptions / notes" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
