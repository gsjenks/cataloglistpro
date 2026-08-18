// src/components/EstateFulfillmentPanel.tsx
// Estate-sale fulfillment = deliveries. Lots sold at the register and marked
// "for delivery" are grouped by their sale (buyer), each shown as a delivery
// manifest: the items, the delivery address/date, and the mover company + contact
// captured at checkout. Printable for handing to the mover.

import { useCallback, useEffect, useState } from 'react';
import { Truck, Printer, MapPin, Calendar, User, Phone, Mail, AlertTriangle, Pencil, FileSignature } from 'lucide-react';
import DeliveryMoverManifest from './DeliveryMoverManifest';
import { supabase } from '../lib/supabase';
import type { Lot } from '../types';

interface Props {
  saleId: string;
  saleName: string;
  lots: Lot[];
  onChanged: () => void;
}

interface Txn {
  id: string;
  shopper_id: string | null;
  buyer_name: string | null;
  delivery_address: string | null;
  delivery_date: string | null;
  delivery_estimate: string | null;
  delivery_company: string | null;
  delivery_company_phone: string | null;
  delivery_company_email: string | null;
}

interface ShopperDelivery {
  delivery_address: string | null;
  delivery_date: string | null;
  delivery_estimate: string | null;
  delivery_company: string | null;
  delivery_company_phone: string | null;
  delivery_company_email: string | null;
}

interface Delivery {
  address: string | null; date: string | null; estimate: string | null;
  company: string | null; phone: string | null; email: string | null;
}

interface Group {
  key: string;
  txn: Txn | null;   // set when the delivery is backed by a POS transaction
  lots: Lot[];       // the item(s) going out together
  total: number;
  buyer: string | null;
  del: Delivery;     // effective delivery info (transaction, else lot-level)
}

const money = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-indigo-600';

const emptyForm = { address: '', date: '', estimate: '', company: '', phone: '', email: '' };
const emptyDelivery = (): Delivery => ({ address: null, date: null, estimate: null, company: null, phone: null, email: null });

export default function EstateFulfillmentPanel({ lots, saleName, onChanged }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [manifestFor, setManifestFor] = useState<Group | null>(null);

  // Base set: every sold lot. Whether it's a delivery is decided below from the
  // sale line's fulfillment (like the Disposition Report), not only the lot flag.
  const soldLots = lots.filter((l) => l.inventory_status === 'sold');
  const key = soldLots.map((l) => l.id).sort().join(',');

  const load = useCallback(async () => {
    setLoading(true);
    const soldIds = key ? key.split(',') : [];
    if (soldIds.length === 0) { setGroups([]); setLoading(false); return; }
    const soldById = new Map(lots.filter((l) => l.inventory_status === 'sold').map((l) => [l.id, l]));

    // Sale lines for every sold lot: gives the buyer link AND the delivery flag.
    const { data: items } = await supabase
      .from('sales_transaction_items')
      .select('lot_id, transaction_id, fulfillment')
      .in('lot_id', soldIds);
    const lotToTxn = new Map<string, string>();
    const lotFulfil = new Map<string, string | null>();
    ((items as { lot_id: string; transaction_id: string; fulfillment: string | null }[] | null) || []).forEach((i) => {
      lotToTxn.set(i.lot_id, i.transaction_id);
      lotFulfil.set(i.lot_id, i.fulfillment);
    });

    // A lot is out for delivery if its sale line says so, or the lot is flagged.
    const ids = soldIds.filter((id) => lotFulfil.get(id) === 'delivery' || soldById.get(id)?.for_delivery);
    if (ids.length === 0) { setGroups([]); setLoading(false); return; }

    // Fresh lot-level delivery fields (so lot-based edits reflect without waiting
    // on the parent to reload the lots prop).
    const { data: lotDeliv } = await supabase
      .from('lots')
      .select('id, delivery_address, delivery_date, delivery_estimate, delivery_company, delivery_company_phone, delivery_company_email')
      .in('id', ids);
    const lotDelivById = new Map<string, Delivery>();
    ((lotDeliv as (ShopperDelivery & { id: string })[] | null) || []).forEach((r) =>
      lotDelivById.set(r.id, {
        address: r.delivery_address, date: r.delivery_date, estimate: r.delivery_estimate,
        company: r.delivery_company, phone: r.delivery_company_phone, email: r.delivery_company_email,
      }));

    const txnIds = [...new Set([...lotToTxn.values()])];
    const txnById = new Map<string, Txn>();
    if (txnIds.length) {
      // Core fields — never include shopper_id here, so a missing shopper_id
      // column (unrun migration) can't 400 the whole query and hide the buyers.
      const { data: txns } = await supabase
        .from('sales_transactions')
        .select('id, buyer_name, delivery_address, delivery_date, delivery_estimate, delivery_company, delivery_company_phone, delivery_company_email')
        .in('id', txnIds);
      const txnRows = (txns as Txn[] | null) || [];
      txnRows.forEach((t) => txnById.set(t.id, t));

      // Optional: pull shopper_id separately for the saved-profile fallback. If
      // that column isn't migrated yet, just skip the fallback (buyers/delivery
      // from the transaction still show).
      const sidRes = await supabase.from('sales_transactions').select('id, shopper_id').in('id', txnIds);
      if (!sidRes.error) {
        const shopperByTxn = new Map<string, string>();
        ((sidRes.data as { id: string; shopper_id: string | null }[] | null) || []).forEach((r) => {
          if (r.shopper_id) shopperByTxn.set(r.id, r.shopper_id);
        });
        const shopperIds = [...new Set(shopperByTxn.values())];
        if (shopperIds.length) {
          const { data: shoppers } = await supabase
            .from('shoppers')
            .select('id, delivery_address, delivery_date, delivery_estimate, delivery_company, delivery_company_phone, delivery_company_email')
            .in('id', shopperIds);
          const profileById = new Map<string, ShopperDelivery>();
          ((shoppers as (ShopperDelivery & { id: string })[] | null) || []).forEach((s) => profileById.set(s.id, s));
          txnById.forEach((t, id) => {
            const p = shopperByTxn.get(id) ? profileById.get(shopperByTxn.get(id)!) : undefined;
            if (p) {
              t.delivery_address = t.delivery_address ?? p.delivery_address;
              t.delivery_date = t.delivery_date ?? p.delivery_date;
              t.delivery_estimate = t.delivery_estimate ?? p.delivery_estimate;
              t.delivery_company = t.delivery_company ?? p.delivery_company;
              t.delivery_company_phone = t.delivery_company_phone ?? p.delivery_company_phone;
              t.delivery_company_email = t.delivery_company_email ?? p.delivery_company_email;
            }
          });
        }
      }
    }

    // Group delivery lots. Transaction-backed lots group by their sale (buyer);
    // lots with no transaction stand alone (per lot) so each still holds its own
    // delivery info on the lot itself.
    const byKey = new Map<string, Group>();
    for (const id of ids) {
      const l = soldById.get(id);
      if (!l) continue;
      const tid = lotToTxn.get(id);
      const gkey = tid ?? `lot:${id}`;
      const t = tid ? txnById.get(tid) ?? null : null;
      const g = byKey.get(gkey) ?? { key: gkey, txn: t, lots: [], total: 0, buyer: t?.buyer_name ?? null, del: emptyDelivery() };
      g.lots.push(l);
      g.total += l.sold_price ?? 0;
      byKey.set(gkey, g);
    }
    // Effective delivery: from the transaction (already shopper-merged) when
    // there is one, otherwise from the lot's own delivery fields.
    for (const g of byKey.values()) {
      if (g.txn) {
        g.del = {
          address: g.txn.delivery_address, date: g.txn.delivery_date, estimate: g.txn.delivery_estimate,
          company: g.txn.delivery_company, phone: g.txn.delivery_company_phone, email: g.txn.delivery_company_email,
        };
      } else {
        g.del = lotDelivById.get(g.lots[0].id) ?? emptyDelivery();
      }
    }
    const result = [...byKey.values()].sort((a, b) =>
      (a.buyer || a.lots[0]?.name || 'zzz').localeCompare(b.buyer || b.lots[0]?.name || 'zzz'),
    );
    setGroups(result);
    setLoading(false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const openEdit = (g: Group) => {
    setEditKey(g.key);
    setForm({
      address: g.del.address ?? '', date: g.del.date ?? '', estimate: g.del.estimate ?? '',
      company: g.del.company ?? '', phone: g.del.phone ?? '', email: g.del.email ?? '',
    });
  };

  const saveEdit = async () => {
    const g = groups.find((x) => x.key === editKey);
    if (!g) return;
    setSaving(true);
    const patch = {
      delivery_address: form.address.trim() || null,
      delivery_date: form.date.trim() || null,
      delivery_estimate: form.estimate.trim() || null,
      delivery_company: form.company.trim() || null,
      delivery_company_phone: form.phone.trim() || null,
      delivery_company_email: form.email.trim() || null,
    };
    // Save to the transaction when there is one, else onto the lot(s) themselves.
    const { error } = g.txn
      ? await supabase.from('sales_transactions').update(patch).eq('id', g.txn.id)
      : await supabase.from('lots').update({ ...patch, updated_at: new Date().toISOString() }).in('id', g.lots.map((l) => l.id));
    setSaving(false);
    if (error) { alert('Could not save delivery details: ' + error.message); return; }
    setEditKey(null);
    await load();
    onChanged?.();
  };

  const itemCount = groups.reduce((s, g) => s + g.lots.length, 0);
  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden !important; } #estate-fulfillment-print, #estate-fulfillment-print * { visibility: visible !important; } #estate-fulfillment-print { position: absolute; inset: 0; margin: 0; } .no-print { display: none !important; } .manifest-card { break-inside: avoid; page-break-inside: avoid; } }`}</style>

      <div id="estate-fulfillment-print" className="space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-gray-500" /> Deliveries
              </h2>
              <p className="text-sm text-gray-500">
                {groups.length} delivery{groups.length === 1 ? '' : ' groups'} · {itemCount} item{itemCount === 1 ? '' : 's'} · {money(grandTotal)}
              </p>
              <p className="hidden print:block text-xs text-gray-500 mt-0.5">{saleName}</p>
            </div>
            <button
              onClick={() => window.print()}
              disabled={groups.length === 0}
              className="no-print inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" /> Print manifests
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">Loading deliveries…</div>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
            No items marked for delivery yet. Mark an item “For delivery” at the register and it appears here after checkout.
          </div>
        ) : (
          groups.map((g) => {
            const d = g.del;
            const hasMover = !!(d.company || d.phone || d.email);
            const hasAddress = !!d.address;
            const title = g.buyer || (g.txn ? 'Sale (no buyer recorded)' : `${g.lots[0]?.name ?? 'Delivery'} — no buyer recorded`);
            return (
              <div key={g.key} className="manifest-card bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
                    <p className="text-xs text-gray-500">{g.lots.length} item{g.lots.length === 1 ? '' : 's'} · {money(g.total)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {(d.date || d.estimate) && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                        <Calendar className="w-4 h-4" /> {d.date}{d.date && d.estimate ? ' · ' : ''}{d.estimate}
                      </span>
                    )}
                    {editKey !== g.key && (
                      <>
                        <button
                          onClick={() => setManifestFor(g)}
                          className="no-print inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
                        >
                          <FileSignature className="w-3.5 h-3.5" /> Manifest
                        </button>
                        <button
                          onClick={() => openEdit(g)}
                          className="no-print inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Delivery + mover details — view or edit */}
                {editKey === g.key ? (
                  <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50/40 p-3 space-y-2 no-print">
                    <p className="text-xs font-semibold text-indigo-900">Delivery &amp; mover details</p>
                    <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Delivery address" className={inputCls} />
                    <div className="flex gap-2">
                      <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="Delivery date" className={inputCls} />
                      <input value={form.estimate} onChange={(e) => setForm({ ...form, estimate: e.target.value })} placeholder="Time / estimate" className={inputCls} />
                    </div>
                    <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Mover / delivery company" className={inputCls} />
                    <div className="flex gap-2">
                      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Mover phone" className={inputCls} />
                      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Mover email" className={inputCls} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={saveEdit} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:bg-gray-300">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditKey(null)} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <div className="rounded-md border border-gray-200 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Deliver to</p>
                      {hasAddress ? (
                        <p className="text-sm text-gray-800 flex items-start gap-1.5">
                          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" /> {d.address}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-700 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" /> No delivery address on file
                        </p>
                      )}
                      {(d.date || d.estimate) && (
                        <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-1.5">
                          <Calendar className="w-4 h-4 text-gray-400" /> {d.date}{d.date && d.estimate ? ' · ' : ''}{d.estimate}
                        </p>
                      )}
                    </div>
                    <div className="rounded-md border border-gray-200 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Mover / delivery company</p>
                      {hasMover ? (
                        <div className="text-sm text-gray-800 space-y-0.5">
                          {d.company && <p className="flex items-center gap-1.5"><User className="w-4 h-4 text-gray-400" /> {d.company}</p>}
                          {d.phone && <p className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-gray-400" /> <a href={`tel:${d.phone}`} className="hover:underline">{d.phone}</a></p>}
                          {d.email && <p className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-gray-400" /> <a href={`mailto:${d.email}`} className="hover:underline">{d.email}</a></p>}
                        </div>
                      ) : (
                        <p className="text-sm text-amber-700 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" /> No mover details on file
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Lots */}
                <div className="mt-3 border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left font-medium px-3 py-2 w-16">Lot</th>
                        <th className="text-left font-medium px-3 py-2">Item</th>
                        <th className="text-right font-medium px-3 py-2 w-28">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {g.lots.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-1.5 text-gray-500">{l.lot_number ?? '—'}</td>
                          <td className="px-3 py-1.5">{l.name}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{money(l.sold_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      {manifestFor && (
        <DeliveryMoverManifest
          saleName={saleName}
          buyer={manifestFor.buyer}
          address={manifestFor.del.address}
          date={manifestFor.del.date}
          estimate={manifestFor.del.estimate}
          company={manifestFor.del.company}
          phone={manifestFor.del.phone}
          email={manifestFor.del.email}
          lots={manifestFor.lots}
          total={manifestFor.total}
          onClose={() => setManifestFor(null)}
        />
      )}
    </div>
  );
}
