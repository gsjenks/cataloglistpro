// src/components/FulfillmentPanel.tsx
// Stage 6 — fulfillment board. Paid lots are grouped by buyer (one shipment per
// buyer); each shipment is assigned a handoff — a shipper from the company directory
// (with contact info) or a built-in Pickup / Store. Assigned shipments are then
// SEPARATED into a section per shipper (so you can see everything in a shipper's
// possession and work each pile): ship (with tracking) → delivered, or picked up.
// See ShipperService, ShippersManager, FulfillmentService.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, PackageCheck, MapPin, X, Undo2, CheckCircle2, Settings, Phone, Mail, ClipboardList, ListOrdered, Receipt, Tags } from 'lucide-react';
import type { Lot, LotBuyer, Shipper } from '../types';
import { setCarrier, shipLots, markPickedUp, markDelivered, resetFulfillment } from '../services/FulfillmentService';
import { listShippers } from '../services/ShipperService';
import { generateShippingLabels } from '../services/LabelService';
import { useApp } from '../context/AppContext';
import ShippersManager from './ShippersManager';
import PackingInvoice from './PackingInvoice';
import ShipperManifest from './ShipperManifest';
import AuctionPackingList from './AuctionPackingList';
import BuyerInvoices from './BuyerInvoices';

interface Props {
  saleId: string;
  companyId?: string;
  saleName: string;
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

interface Handoff {
  value: string;
  label: string;
  ships: boolean;
  kind: string;
  phone?: string;
  email?: string;
}

type Status = 'pending' | 'shipped' | 'done';

const BUILTIN: Handoff[] = [
  { value: 'pickup', label: 'Pickup', ships: false, kind: 'pickup' },
  { value: 'store', label: 'Store hold', ships: false, kind: 'pickup' },
];

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

export default function FulfillmentPanel({ saleId, companyId, saleName, lots, onChanged }: Props) {
  const { currentCompany } = useApp();
  // Only trust the active company when it's the one that owns this sale.
  const company = currentCompany && currentCompany.id === companyId ? currentCompany : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [shipFor, setShipFor] = useState<Group | null>(null);
  const [tracking, setTracking] = useState('');
  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [showShippers, setShowShippers] = useState(false);
  const [invoiceFor, setInvoiceFor] = useState<Group | null>(null);
  // Carrier value whose handoff manifest is open (built from ALL its shipments, not
  // the search-filtered view — a sheet someone signs must not silently omit lots).
  const [manifestFor, setManifestFor] = useState<string | null>(null);
  // Packing-session paperwork: master list, buyer invoices (all or one), lot labels.
  const [showPackingList, setShowPackingList] = useState(false);
  const [invoicesFor, setInvoicesFor] = useState<string | null>(null);  // '' = every buyer
  const [search, setSearch] = useState('');

  const loadShippers = useCallback(async () => {
    if (!companyId) return;
    try {
      setShippers(await listShippers(companyId));
    } catch (e) {
      console.error('Failed to load shippers:', e);
    }
  }, [companyId]);
  useEffect(() => { loadShippers(); }, [loadShippers]);

  const handoffs = useMemo<Handoff[]>(
    () => [
      ...shippers
        .filter((s) => s.active !== false)
        .map((s) => ({ value: s.id, label: s.name, ships: true, kind: s.kind || 'external', phone: s.phone, email: s.email })),
      ...BUILTIN,
    ],
    [shippers],
  );
  const handoffByValue = useMemo(() => Object.fromEntries(handoffs.map((h) => [h.value, h])), [handoffs]);
  const resolve = (value?: string): Handoff | undefined => (value ? handoffByValue[value] : undefined);
  // Shipper id → display name, for the packing paperwork (labels, list, invoices).
  const carrierLabel = useCallback(
    (value?: string) => (value ? handoffByValue[value]?.label ?? value : 'Unassigned'),
    [handoffByValue],
  );

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

  const q = search.trim().toLowerCase();
  const visible = q
    ? groups.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.lots.some(
            (l) => String(l.lot_number ?? '').includes(q) || (l.tracking_number ?? '').toLowerCase().includes(q),
          ),
      )
    : groups;

  const unassigned = visible.filter((g) => !g.carrier);
  const sections = useMemo(() => {
    const values = [...new Set(visible.filter((g) => g.carrier).map((g) => g.carrier!))];
    return values
      .map((v) => ({ value: v, info: resolve(v) ?? { value: v, label: v, ships: true, kind: 'external' }, groups: visible.filter((g) => g.carrier === v) }))
      .sort((a, b) => {
        const rank = (k: string) => (k === 'pickup' ? 1 : 0);
        if (rank(a.info.kind) !== rank(b.info.kind)) return rank(a.info.kind) - rank(b.info.kind);
        return a.info.label.localeCompare(b.info.label);
      });
  }, [visible, handoffByValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); onChanged(); }
    catch (e) { console.error('Fulfillment action failed:', e); alert('Action failed. See console.'); }
    finally { setBusy(null); }
  };

  const ids = (g: Group) => g.lots.map((l) => l.id);

  const submitShip = () => {
    if (!shipFor) return;
    run(`ship:${shipFor.key}`, () => shipLots(ids(shipFor), tracking)).then(() => { setShipFor(null); setTracking(''); });
  };

  const printLabels = async () => {
    setBusy('labels');
    try {
      const n = await generateShippingLabels(lots, {
        saleName,
        companyName: company?.name,
        companyPhone: company?.phone,
        carrierLabel,
      });
      if (n === 0) alert('No lots to label — everything sold has already been handed off.');
    } catch (e) {
      console.error('Label generation failed:', e);
      alert('Could not generate labels. See console.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900">Fulfillment</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">{unassigned.length} to assign · {groups.length - unassigned.length} assigned</p>
            <button onClick={() => setShowShippers(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
              <Settings className="w-3.5 h-3.5" /> Manage shippers
            </button>
          </div>
        </div>

        {/* Packing session paperwork — the three things you print before packing. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <span className="text-xs text-gray-500 mr-1">Print for packing:</span>
          <button
            onClick={() => setShowPackingList(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            title="Every sold lot with buyer, address and shipper"
          >
            <ListOrdered className="w-3.5 h-3.5" /> Packing list
          </button>
          <button
            onClick={() => setInvoicesFor('')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            title="One invoice per buyer — hammer, premium, tax, total"
          >
            <Receipt className="w-3.5 h-3.5" /> Buyer invoices
          </button>
          <button
            onClick={printLabels}
            disabled={busy === 'labels'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="One Avery 55163 label per lot, with buyer, address and piece count"
          >
            <Tags className="w-3.5 h-3.5" /> {busy === 'labels' ? 'Building…' : 'Lot labels (PDF)'}
          </button>
        </div>

        {groups.length > 0 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Look up by buyer, tracking #, or lot #…"
            className="mt-3 w-full border border-gray-300 rounded-md p-2 text-sm"
          />
        )}

        {groups.length === 0 && <div className="mt-6 text-center py-8 text-gray-400 text-sm">No paid lots to fulfill yet.</div>}

        {unassigned.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">To assign ({unassigned.length})</h3>
            <ul className="space-y-3">
              {unassigned.map((g) => (
                <li key={g.key} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-3">
                  <GroupInfo g={g} />
                  <select
                    value=""
                    onChange={(e) => {
                      const h = handoffByValue[e.target.value];
                      if (h) run(`carrier:${g.key}`, () => setCarrier(ids(g), h.value, h.ships));
                    }}
                    disabled={busy === `carrier:${g.key}`}
                    className="border border-gray-300 rounded-md p-2 text-sm shrink-0"
                  >
                    <option value="">Assign handoff…</option>
                    {shippers.filter((s) => s.active !== false).length > 0 && (
                      <optgroup label="Shippers">
                        {shippers.filter((s) => s.active !== false).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Handoff">
                      {BUILTIN.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </optgroup>
                  </select>
                </li>
              ))}
            </ul>
            {shippers.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">No shippers yet — add FedEx, USPS, your courier, etc. via “Manage shippers”.</p>
            )}
          </div>
        )}
      </div>

      {sections.map(({ value, info, groups: gs }) => (
        <div key={value} className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Truck className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900">{info.label}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{info.kind}</span>
            <span className="text-sm text-gray-500">({gs.length})</span>
            <button
              onClick={() => setManifestFor(value)}
              className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              title="One-page handoff manifest for this shipper — driver signs once"
            >
              <ClipboardList className="w-3.5 h-3.5" /> Manifest
            </button>
          </div>
          {(info.phone || info.email) && (
            <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-x-3">
              {info.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{info.phone}</span>}
              {info.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{info.email}</span>}
            </div>
          )}
          <ul className="space-y-3">
            {gs.map((g) => {
              const status = groupStatus(g);
              const trackingNo = g.lots.find((l) => l.tracking_number)?.tracking_number;
              return (
                <li key={g.key} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <GroupInfo g={g} status={status} pickup={!info.ships} />
                    {trackingNo && <div className="text-xs text-gray-500 mt-1">Tracking: {trackingNo}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {status === 'pending' && info.ships && (
                      <button onClick={() => { setShipFor(g); setTracking(''); }} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">
                        <Truck className="w-3.5 h-3.5" /> Ship
                      </button>
                    )}
                    {status === 'pending' && !info.ships && (
                      <button onClick={() => run(`pickup:${g.key}`, () => markPickedUp(ids(g)))} disabled={busy === `pickup:${g.key}`} className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                        Picked up
                      </button>
                    )}
                    {status === 'shipped' && (
                      <button onClick={() => run(`deliver:${g.key}`, () => markDelivered(ids(g)))} disabled={busy === `deliver:${g.key}`} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                        <PackageCheck className="w-3.5 h-3.5" /> Delivered
                      </button>
                    )}
                    <button onClick={() => setInvoiceFor(g)} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50" title="Packing slip (contents + signature)">
                      Slip
                    </button>
                    <button onClick={() => setInvoicesFor(g.key)} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50" title="Buyer invoice (hammer, premium, tax, total)">
                      Invoice
                    </button>
                    <button onClick={() => run(`reset:${g.key}`, () => resetFulfillment(ids(g)))} disabled={busy === `reset:${g.key}`} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50" title="Reset (unassign)">
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {shipFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">Ship to {shipFor.name} · {resolve(shipFor.carrier)?.label}</h3>
              <button onClick={() => setShipFor(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">{shipFor.lots.length} lot(s). Marks the whole shipment shipped.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tracking number (optional)</label>
            <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="carrier tracking #" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShipFor(null)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={submitShip} disabled={busy === `ship:${shipFor.key}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <CheckCircle2 className="w-4 h-4" /> Mark shipped
              </button>
            </div>
          </div>
        </div>
      )}

      {showShippers && (
        <ShippersManager companyId={companyId} shippers={shippers} onChanged={loadShippers} onClose={() => setShowShippers(false)} />
      )}

      {showPackingList && (
        <AuctionPackingList
          saleName={saleName}
          companyName={company?.name}
          lots={lots}
          carrierLabel={carrierLabel}
          onClose={() => setShowPackingList(false)}
        />
      )}

      {invoicesFor !== null && (
        <BuyerInvoices
          saleId={saleId}
          saleName={saleName}
          companyName={company?.name}
          companyPhone={company?.phone}
          companyAddress={company?.address}
          lots={lots}
          buyerKey={invoicesFor || undefined}
          carrierLabel={carrierLabel}
          onClose={() => setInvoicesFor(null)}
        />
      )}

      {manifestFor && (
        <ShipperManifest
          saleName={saleName}
          shipperLabel={resolve(manifestFor)?.label ?? manifestFor}
          shipperKind={resolve(manifestFor)?.kind}
          phone={resolve(manifestFor)?.phone}
          email={resolve(manifestFor)?.email}
          shipments={groups.filter((g) => g.carrier === manifestFor)}
          onClose={() => setManifestFor(null)}
        />
      )}

      {invoiceFor && (
        <PackingInvoice
          saleName={saleName}
          buyerName={invoiceFor.name}
          buyer={invoiceFor.buyer}
          handoffLabel={resolve(invoiceFor.carrier)?.label ?? 'Unassigned'}
          lots={invoiceFor.lots}
          onClose={() => setInvoiceFor(null)}
        />
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
      {addr && <div className="text-xs text-gray-500 mt-1 flex items-start gap-1"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{addr}</span></div>}
      <div className="text-xs text-gray-400 mt-1">{g.lots.map((l) => `#${l.lot_number}`).join(', ')}</div>
    </div>
  );
}

function StatusBadge({ status, pickup }: { status: Status; pickup?: boolean }) {
  if (status === 'done') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">{pickup ? 'Picked up' : 'Delivered'}</span>;
  if (status === 'shipped') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">Shipped</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Ready</span>;
}
