// src/components/FulfillmentPanel.tsx
// Stage 6 — fulfillment worklist. Paid lots are grouped by buyer (one shipment per
// buyer); each shipment is assigned a carrier/handoff (FedEx, USPS, Allied, crating,
// in-house, pickup, store…). The board then SEPARATES packages by carrier so each
// pile can be worked: ship (with tracking) / picked up / delivered. See carriers.ts,
// FulfillmentService.

import { useMemo, useState } from 'react';
import { Truck, PackageCheck, MapPin, X, Undo2, CheckCircle2 } from 'lucide-react';
import type { Lot, LotBuyer } from '../types';
import { CARRIERS, carrierLabel } from '../lib/carriers';
import { setCarrier, shipLots, markPickedUp, markDelivered, resetFulfillment } from '../services/FulfillmentService';

interface Props {
  saleId: string;
  lots: Lot[];
  onChanged: () => void;
}

interface Group {
  key: string;
  name: string;
  buyer: LotBuyer;
  lots: Lot[];
  carrier?: string;
}

type Status = 'pending' | 'shipped' | 'done';

const money = (n?: number) => (n == null ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

function addressText(b: LotBuyer): string {
  const cityLine = [b.city, b.state, b.zip].filter(Boolean).join(' ');
  return [b.address, cityLine, b.country && b.country !== 'US' ? b.country : ''].filter(Boolean).join(', ');
}

function groupStatus(g: Group): Status {
  if (g.lots.every((l) => l.delivered_at)) return 'done';
  if (g.lots.every((l) => l.shipped_at)) return 'shipped';
  return 'pending';
}

export default function FulfillmentPanel({ lots, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [shipFor, setShipFor] = useState<Group | null>(null);
  const [tracking, setTracking] = useState('');

  const groups = useMemo<Group[]>(() => {
    const paid = lots.filter((l) => l.outcome === 'sold' && l.payment_status === 'paid');
    const map = new Map<string, Group>();
    for (const l of paid) {
      const b = l.buyer ?? {};
      const key = b.email || b.name || 'unknown';
      if (!map.has(key)) map.set(key, { key, name: b.name || 'Unknown buyer', buyer: b, lots: [], carrier: l.fulfillment_carrier });
      const g = map.get(key)!;
      g.lots.push(l);
      if (!g.carrier && l.fulfillment_carrier) g.carrier = l.fulfillment_carrier;
    }
    return [...map.values()];
  }, [lots]);

  const unassigned = groups.filter((g) => !g.carrier);
  const byCarrier = CARRIERS.map((c) => ({ carrier: c, groups: groups.filter((g) => g.carrier === c.value) })).filter(
    (s) => s.groups.length > 0,
  );

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      onChanged();
    } catch (e) {
      console.error('Fulfillment action failed:', e);
      alert('Action failed. See console.');
    } finally {
      setBusy(null);
    }
  };

  const ids = (g: Group) => g.lots.map((l) => l.id);

  const submitShip = () => {
    if (!shipFor) return;
    run(`ship:${shipFor.key}`, () => shipLots(ids(shipFor), tracking)).then(() => {
      setShipFor(null);
      setTracking('');
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900">Fulfillment</h2>
          <p className="text-sm text-gray-500">
            {unassigned.length} to assign · {groups.length - unassigned.length} assigned
          </p>
        </div>

        {groups.length === 0 && (
          <div className="mt-6 text-center py-8 text-gray-400 text-sm">No paid lots to fulfill yet.</div>
        )}

        {/* Awaiting carrier assignment */}
        {unassigned.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">To assign ({unassigned.length})</h3>
            <ul className="space-y-3">
              {unassigned.map((g) => (
                <li key={g.key} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-3">
                  <GroupInfo g={g} />
                  <select
                    value=""
                    onChange={(e) => e.target.value && run(`carrier:${g.key}`, () => setCarrier(ids(g), e.target.value))}
                    disabled={busy === `carrier:${g.key}`}
                    className="border border-gray-300 rounded-md p-2 text-sm shrink-0"
                  >
                    <option value="">Assign carrier…</option>
                    {CARRIERS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* One section per carrier in use */}
      {byCarrier.map(({ carrier, groups: gs }) => (
        <div key={carrier.value} className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900">{carrier.label}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{carrier.kind}</span>
            <span className="text-sm text-gray-500">({gs.length})</span>
          </div>
          <ul className="space-y-3">
            {gs.map((g) => {
              const status = groupStatus(g);
              const trackingNo = g.lots.find((l) => l.tracking_number)?.tracking_number;
              return (
                <li key={g.key} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <GroupInfo g={g} status={status} pickup={!carrier.ships} />
                    {trackingNo && <div className="text-xs text-gray-500 mt-1">Tracking: {trackingNo}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {status === 'pending' && carrier.ships && (
                      <button onClick={() => { setShipFor(g); setTracking(''); }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
                        <Truck className="w-3.5 h-3.5" /> Ship
                      </button>
                    )}
                    {status === 'pending' && !carrier.ships && (
                      <button onClick={() => run(`pickup:${g.key}`, () => markPickedUp(ids(g)))} disabled={busy === `pickup:${g.key}`}
                        className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                        Picked up
                      </button>
                    )}
                    {status === 'shipped' && (
                      <button onClick={() => run(`deliver:${g.key}`, () => markDelivered(ids(g)))} disabled={busy === `deliver:${g.key}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                        <PackageCheck className="w-3.5 h-3.5" /> Delivered
                      </button>
                    )}
                    <button onClick={() => run(`reset:${g.key}`, () => resetFulfillment(ids(g)))} disabled={busy === `reset:${g.key}`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      title="Reset (unassign carrier)">
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* Ship modal */}
      {shipFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                Ship to {shipFor.name} · {carrierLabel(shipFor.carrier)}
              </h3>
              <button onClick={() => setShipFor(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">{shipFor.lots.length} lot(s). Marks the whole shipment shipped.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tracking number (optional)</label>
            <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="carrier tracking #" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShipFor(null)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={submitShip} disabled={busy === `ship:${shipFor.key}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <CheckCircle2 className="w-4 h-4" /> Mark shipped
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupInfo({ g, status, pickup }: { g: Group; status?: Status; pickup?: boolean }) {
  const total = g.lots.reduce((s, l) => s + (l.sold_price ?? 0), 0);
  const addr = addressText(g.buyer);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{g.name}</span>
        {status && <StatusBadge status={status} pickup={pickup} />}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{g.lots.length} lot(s) · {money(total)}</div>
      {addr && (
        <div className="text-xs text-gray-500 mt-1 flex items-start gap-1">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{addr}</span>
        </div>
      )}
      <div className="text-xs text-gray-400 mt-1">{g.lots.map((l) => `#${l.lot_number}`).join(', ')}</div>
    </div>
  );
}

function StatusBadge({ status, pickup }: { status: Status; pickup?: boolean }) {
  if (status === 'done') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">{pickup ? 'Picked up' : 'Delivered'}</span>;
  }
  if (status === 'shipped') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Shipped</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Ready</span>;
}
