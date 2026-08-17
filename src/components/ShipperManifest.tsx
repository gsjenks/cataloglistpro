// src/components/ShipperManifest.tsx
// Stage 6 — printable HANDOFF MANIFEST for one shipper: every lot going to that
// shipper across all buyers on a single sheet, with one signature block so the
// driver signs once for the whole pickup (name, signature, date, time).
// The per-buyer PackingInvoice travels with each parcel; this is the gate sheet.

import { useMemo, useState } from 'react';
import { X, Printer } from 'lucide-react';
import type { Lot, LotBuyer } from '../types';

export interface ManifestShipment {
  key: string;
  name: string;
  buyer: LotBuyer;
  lots: Lot[];
}

interface Props {
  saleName: string;
  shipperLabel: string;
  shipperKind?: string;
  phone?: string;
  email?: string;
  shipments: ManifestShipment[];
  onClose: () => void;
  onRelease?: (lotIds: string[], released: boolean) => void;
  releasing?: boolean;
}

const money = (n?: number) => (n == null ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

const handedOff = (l: Lot) => !!l.shipped_at || !!l.delivered_at;

function destination(b: LotBuyer): string {
  const cityLine = [b.city, b.state, b.zip].filter(Boolean).join(' ');
  return [b.address, cityLine, b.country && b.country !== 'US' ? b.country : ''].filter(Boolean).join(', ');
}

export default function ShipperManifest({
  saleName, shipperLabel, shipperKind, phone, email, shipments, onClose, onRelease, releasing,
}: Props) {
  // Default to what is actually being handed over now; anything already shipped or
  // delivered is history and shouldn't be on a sheet someone signs for today.
  const [pendingOnly, setPendingOnly] = useState(true);
  const [confirmAll, setConfirmAll] = useState(false);

  const rows = useMemo(
    () =>
      shipments
        .map((s) => ({ ...s, lots: pendingOnly ? s.lots.filter((l) => !handedOff(l)) : s.lots }))
        .filter((s) => s.lots.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [shipments, pendingOnly],
  );

  const lotCount = rows.reduce((n, s) => n + s.lots.length, 0);
  const total = rows.reduce((n, s) => n + s.lots.reduce((m, l) => m + (l.sold_price ?? 0), 0), 0);
  const pendingIds = rows.flatMap((s) => s.lots).filter((l) => !handedOff(l)).map((l) => l.id);
  const printedAt = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #manifest-print, #manifest-print * { visibility: visible !important; }
        #manifest-print { position: absolute; inset: 0; margin: 0; box-shadow: none; max-height: none; overflow: visible; }
        .no-print { display: none !important; }
        .shipment-block { break-inside: avoid; page-break-inside: avoid; }
        .sign-block { break-inside: avoid; page-break-inside: avoid; }
        thead { display: table-header-group; }
        .print-only { display: inline-block !important; }
      }
      .print-only { display: none; }`}</style>

      <div id="manifest-print" className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-3 no-print">
          <h3 className="text-lg font-semibold text-gray-900">Handoff manifest</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={(e) => setPendingOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Not yet handed off only
            </label>
            {onRelease && pendingIds.length > 0 && (
              <button
                onClick={() => setConfirmAll(true)}
                disabled={releasing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Mark all handed off
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Confirm the whole-group handoff. */}
        {confirmAll && (
          <div className="no-print bg-amber-50 border-b border-amber-200 px-6 py-4">
            <p className="text-sm text-amber-900">
              Choosing this option will confirm all {pendingIds.length} lot(s) have been handed off
              to buyers for this group.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => { onRelease?.(pendingIds, true); setConfirmAll(false); }}
                disabled={releasing}
                className="px-3 py-1.5 text-sm rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {releasing ? 'Marking…' : 'Yes, mark all handed off'}
              </button>
              <button
                onClick={() => setConfirmAll(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="p-6 space-y-5 text-sm text-gray-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Handoff Manifest</h2>
              <div className="text-gray-600 mt-1">{saleName}</div>
              <div className="text-xs text-gray-400 mt-0.5">Prepared {printedAt}</div>
            </div>
            <div className="text-right text-gray-600">
              <div className="text-xs uppercase tracking-wide text-gray-400">Released to</div>
              <div className="font-medium text-gray-900">{shipperLabel}</div>
              {shipperKind && <div className="text-xs text-gray-500 capitalize">{shipperKind}</div>}
              {phone && <div className="text-xs text-gray-500">{phone}</div>}
              {email && <div className="text-xs text-gray-500">{email}</div>}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span className="font-semibold text-gray-900">{lotCount}</span> lot(s)</span>
            <span><span className="font-semibold text-gray-900">{rows.length}</span> shipment(s)</span>
            <span className="text-gray-600">Declared value <span className="tabular-nums text-gray-900">{money(total)}</span></span>
          </div>

          {rows.length === 0 ? (
            <p className="text-center text-gray-400 py-8">
              {pendingOnly ? 'Everything for this shipper has already been handed off.' : 'Nothing assigned to this shipper.'}
            </p>
          ) : (
            <div className="space-y-4">
              {rows.map((s) => {
                const subtotal = s.lots.reduce((n, l) => n + (l.sold_price ?? 0), 0);
                const addr = destination(s.buyer);
                return (
                  <div key={s.key} className="shipment-block border border-gray-200 rounded-md overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{s.name}</div>
                        {addr && <div className="text-xs text-gray-600">{addr}</div>}
                        {(s.buyer.phone || s.buyer.email) && (
                          <div className="text-xs text-gray-500">
                            {[s.buyer.phone, s.buyer.email].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 text-right shrink-0">
                        {s.lots.length} lot(s)<br />
                        <span className="tabular-nums">{money(subtotal)}</span>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-gray-500">
                        <tr>
                          <th className="text-left font-medium px-3 py-1.5 w-14">Lot</th>
                          <th className="text-left font-medium px-3 py-1.5">Item</th>
                          <th className="text-right font-medium px-3 py-1.5 w-24">Value</th>
                          <th className="text-center font-medium px-3 py-1.5 w-12">✓</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {s.lots.map((l) => {
                          const off = handedOff(l);
                          return (
                            <tr key={l.id} className={off ? 'text-gray-400' : undefined}>
                              <td className="px-3 py-1.5 text-gray-500">{l.lot_number ?? ''}</td>
                              <td className="px-3 py-1.5">{l.name}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{money(l.sold_price)}</td>
                              <td className="px-3 py-1.5 text-center">
                                {onRelease ? (
                                  <input
                                    type="checkbox"
                                    className="no-print w-4 h-4 rounded border-gray-400 accent-green-600"
                                    checked={off}
                                    disabled={releasing}
                                    onChange={(e) => onRelease([l.id], e.target.checked)}
                                    aria-label={`Mark lot ${l.lot_number ?? l.name} handed off`}
                                  />
                                ) : null}
                                <span className="print-only w-4 h-4 border border-gray-400 rounded-sm text-center leading-4">{off ? '✓' : ''}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* One signature for the whole pickup. */}
          <div className="sign-block pt-6">
            <p className="text-xs text-gray-600">
              The undersigned driver confirms receipt of the {lotCount} lot(s) listed above,
              in the condition noted, on behalf of {shipperLabel}.
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-8 mt-5">
              <SignLine label="Driver — print name" />
              <SignLine label="Driver signature" />
              <SignLine label="Date" />
              <SignLine label="Time" />
              <SignLine label="Released by (auction staff)" />
              <SignLine label="Lots received / exceptions" />
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
