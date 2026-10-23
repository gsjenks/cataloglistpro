// src/components/SaleStatistics.tsx
// Sale statistics, opened from the Documents tab: items and sell-through, how
// complete the catalog is, the money (same figures as Reconciliation: refunds
// counted once, see lib/reconciliation.ts), the register (estate) or buyers
// (auction), and breakdowns by category, room and day. Read-only and printable.
// Money sections need can('money').

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Sale, Lot, Consignment, SaleRoom, SalesTransaction } from '../types';
import { computeReconciliation } from '../lib/reconciliation';
import { isSoldLot } from '../lib/lotState';
import { getRefunds, type RefundRecord } from '../services/RefundService';
import { useRole } from '../context/RoleContext';

interface Props {
  sale: Sale;
  lots: Lot[];
  consignments: Consignment[];
  consignorNames: Record<string, string>;
  saleRooms: SaleRoom[];
  onBack: () => void;
}

type Txn = Pick<SalesTransaction, 'id' | 'subtotal' | 'tax' | 'total' | 'tender_type' | 'status' | 'buyer_name' | 'created_at'> & {
  shopper_id?: string | null;
};
interface TxnItem { transaction_id: string; fulfillment: string | null }

const money = (n?: number | null) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

const TENDER_LABELS: Record<string, string> = {
  cash: 'Cash', check: 'Check', venmo: 'Venmo', cashapp: 'Cash App', card: 'Card', other: 'Other',
};

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-gray-200 p-3 bg-white">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-gray-900 tabular-nums ${strong ? 'text-lg font-bold' : 'font-semibold'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="stats-section mt-6">
      <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}

interface Group { key: string; label: string; count: number; sold: number; revenue: number }

// One row per group, with a bar for revenue (or sold count when money is hidden).
function GroupTable({ rows, showMoney }: { rows: Group[]; showMoney: boolean }) {
  const max = Math.max(1, ...rows.map((r) => (showMoney ? r.revenue : r.sold)));
  return (
    <div className="border border-gray-200 rounded-md overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">Name</th>
            <th className="px-3 py-1.5 text-right font-medium">Items</th>
            <th className="px-3 py-1.5 text-right font-medium">Sold</th>
            <th className="px-3 py-1.5 text-right font-medium">Sell-through</th>
            {showMoney && <th className="px-3 py-1.5 text-right font-medium">Sales</th>}
            <th className="px-3 py-1.5 w-1/4 hidden sm:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-1.5">{r.label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.count}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.sold}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{pct(r.sold, r.count)}</td>
              {showMoney && <td className="px-3 py-1.5 text-right tabular-nums">{money(r.revenue)}</td>}
              <td className="px-3 py-1.5 hidden sm:table-cell">
                <div className="h-2 rounded bg-gray-100">
                  <div
                    className="h-2 rounded bg-blue-500"
                    style={{ width: `${((showMoney ? r.revenue : r.sold) / max) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function groupLots(lots: Lot[], keyOf: (l: Lot) => string, labelOf: (k: string) => string): Group[] {
  const map = new Map<string, Group>();
  for (const l of lots) {
    const key = keyOf(l);
    const g = map.get(key) ?? { key, label: labelOf(key), count: 0, sold: 0, revenue: 0 };
    g.count++;
    if (isSoldLot(l)) {
      g.sold++;
      g.revenue += l.sold_price ?? 0;
    }
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default function SaleStatistics({ sale, lots, consignments, consignorNames, saleRooms, onBack }: Props) {
  const { can } = useRole();
  const showMoney = can('money');
  const isEstate = sale.sale_type === 'estate_sale';
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [txnItems, setTxnItems] = useState<TxnItem[]>([]);
  const [photoLotIds, setPhotoLotIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let live = true;
    getRefunds(sale.id).then((r) => { if (live) setRefunds(r); }).catch(() => undefined);
    if (isEstate) {
      (async () => {
        const { data, error } = await supabase
          .from('sales_transactions')
          .select('id, subtotal, tax, total, tender_type, status, buyer_name, shopper_id, created_at')
          .eq('sale_id', sale.id);
        if (error) { console.warn('Register transactions unavailable:', error); return; }
        const rows = ((data as Txn[] | null) || []).filter((t) => t.status !== 'voided');
        if (!live) return;
        setTxns(rows);
        const ids = rows.map((t) => t.id);
        const items: TxnItem[] = [];
        for (let i = 0; i < ids.length; i += 200) {
          const { data: part } = await supabase
            .from('sales_transaction_items')
            .select('transaction_id, fulfillment')
            .in('transaction_id', ids.slice(i, i + 200));
          items.push(...((part as TxnItem[] | null) || []));
        }
        if (live) setTxnItems(items);
      })();
    }
    return () => { live = false; };
  }, [sale.id, isEstate]);

  // Which lots have at least one photo.
  const lotKey = lots.map((l) => l.id).sort().join(',');
  useEffect(() => {
    let live = true;
    (async () => {
      const ids = lotKey ? lotKey.split(',') : [];
      const found = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('photos').select('lot_id').in('lot_id', ids.slice(i, i + 200));
        if (error) { console.warn('Photo counts unavailable:', error); if (live) setPhotoLotIds(null); return; }
        ((data as { lot_id: string }[] | null) || []).forEach((p) => found.add(p.lot_id));
      }
      if (live) setPhotoLotIds(found);
    })();
    return () => { live = false; };
  }, [lotKey]);

  const recon = computeReconciliation(consignments, lots, consignorNames, [], [], refunds);

  const s = useMemo(() => {
    const now = Date.now();
    const sold = lots.filter(isSoldLot);
    const prices = sold.map((l) => l.sold_price ?? 0).filter((p) => p > 0);
    const heldNow = lots.filter((l) => !isSoldLot(l) && l.inventory_status === 'held'
      && (!l.held_until || new Date(l.held_until).getTime() > now)).length;
    const disposed = (d: string) => lots.filter((l) => !isSoldLot(l) && l.disposition === d).length;
    const returned = disposed('returned');
    const charity = disposed('charity');
    const cleanout = disposed('discarded');
    const open = lots.length - sold.length - returned - charity - cleanout;
    // Price realised against the asking price (estate) or the low estimate (auction).
    const askOf = (l: Lot) => (isEstate ? l.starting_bid : l.estimate_low) ?? 0;
    const comparable = sold.filter((l) => askOf(l) > 0 && (l.sold_price ?? 0) > 0);
    const askSum = comparable.reduce((t, l) => t + askOf(l), 0);
    const realisedSum = comparable.reduce((t, l) => t + (l.sold_price ?? 0), 0);
    const openPriced = lots.filter((l) => !isSoldLot(l) && !l.disposition);
    return {
      sold,
      prices,
      heldNow,
      returned, charity, cleanout, open,
      avg: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      med: median(prices),
      top: [...sold].sort((a, b) => (b.sold_price ?? 0) - (a.sold_price ?? 0)).slice(0, 10),
      askSum, realisedSum, comparableCount: comparable.length,
      openValue: openPriced.reduce((t, l) => t + (isEstate ? l.starting_bid ?? 0 : l.estimate_low ?? 0), 0),
      priced: lots.filter((l) => (isEstate ? l.starting_bid : l.estimate_low ?? l.starting_bid) ?? 0).length,
      described: lots.filter((l) => (l.description ?? '').trim().length > 0).length,
      needsDetail: lots.filter((l) => l.needs_detail).length,
      tagged: lots.filter((l) => !!l.tag_printed_at).length,
      located: lots.filter((l) => !!l.room).length,
      estLow: lots.reduce((t, l) => t + (l.estimate_low ?? 0), 0),
      estHigh: lots.reduce((t, l) => t + (l.estimate_high ?? 0), 0),
    };
  }, [lots, isEstate]);

  const byCategory = useMemo(
    () => groupLots(lots, (l) => (l.category || '').trim().toLowerCase() || '—',
      (k) => (k === '—' ? 'No category' : k.charAt(0).toUpperCase() + k.slice(1))),
    [lots],
  );
  const byRoom = useMemo(() => {
    if (!isEstate) return [];
    const names = new Map(saleRooms.map((r) => [r.room_code, r.name]));
    const order = new Map(saleRooms.map((r, i) => [r.room_code, r.sort_order ?? i]));
    return groupLots(lots, (l) => l.room || '—', (k) => (k === '—' ? 'No room' : `${k} ${names.get(k) ?? ''}`.trim()))
      .sort((a, b) => (order.get(a.key) ?? 9999) - (order.get(b.key) ?? 9999));
  }, [lots, saleRooms, isEstate]);

  // Register roll-up (estate).
  const reg = useMemo(() => {
    const tickets = txns.length;
    const total = txns.reduce((t, x) => t + (Number(x.total) || 0), 0);
    const subtotal = txns.reduce((t, x) => t + (Number(x.subtotal) || 0), 0);
    const tax = txns.reduce((t, x) => t + (Number(x.tax) || 0), 0);
    const tender = new Map<string, { count: number; total: number }>();
    txns.forEach((x) => {
      const k = x.tender_type || 'other';
      const e = tender.get(k) ?? { count: 0, total: 0 };
      e.count++; e.total += Number(x.total) || 0;
      tender.set(k, e);
    });
    const byDay = new Map<string, { count: number; total: number }>();
    txns.forEach((x) => {
      if (!x.created_at) return;
      const d = new Date(x.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const e = byDay.get(k) ?? { count: 0, total: 0 };
      e.count++; e.total += Number(x.total) || 0;
      byDay.set(k, e);
    });
    const byHour = new Map<number, number>();
    txns.forEach((x) => {
      if (!x.created_at) return;
      const h = new Date(x.created_at).getHours();
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    });
    const buyers = new Set(txns.map((x) => x.shopper_id || (x.buyer_name || '').trim().toLowerCase()).filter(Boolean));
    const delivery = txnItems.filter((i) => i.fulfillment === 'delivery').length;
    return {
      tickets, total, subtotal, tax, buyers: buyers.size,
      avgTicket: tickets ? total / tickets : 0,
      itemsPerTicket: tickets ? txnItems.length / tickets : 0,
      lines: txnItems.length, delivery, carry: txnItems.length - delivery,
      tender: [...tender.entries()].sort((a, b) => b[1].total - a[1].total),
      days: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      hours: [...byHour.entries()].sort((a, b) => a[0] - b[0]),
    };
  }, [txns, txnItems]);

  // Buyers (auction): from the EOA import's lots.buyer.
  const auctionBuyers = useMemo(() => {
    if (isEstate) return null;
    const map = new Map<string, { name: string; lots: number; total: number }>();
    s.sold.forEach((l) => {
      const b = l.buyer;
      const key = (b?.email || b?.username || b?.name || '').toLowerCase();
      if (!key) return;
      const e = map.get(key) ?? { name: b?.name || b?.username || b?.email || '—', lots: 0, total: 0 };
      e.lots++; e.total += l.sold_price ?? 0;
      map.set(key, e);
    });
    const list = [...map.values()].sort((a, b) => b.total - a.total);
    return {
      count: list.length,
      top: list.slice(0, 10),
      paid: s.sold.filter((l) => l.payment_status === 'paid').length,
      shipped: s.sold.filter((l) => !!l.shipped_at || !!l.delivered_at).length,
    };
  }, [s.sold, isEstate]);

  const fmtDay = (k: string) =>
    new Date(`${k}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
  const maxDay = Math.max(1, ...reg.days.map(([, v]) => v.total));
  const maxHour = Math.max(1, ...reg.hours.map(([, v]) => v));

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden !important; } #sale-stats, #sale-stats * { visibility: visible !important; } #sale-stats { position: absolute; inset: 0; margin: 0; border: none; } .no-print { display: none !important; } .stats-section { break-inside: avoid; } }`}</style>

      <div className="no-print flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to documents
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div id="sale-stats" className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
        <div className="border-b border-gray-200 pb-3">
          <h2 className="text-xl font-bold text-gray-900">Sale Statistics</h2>
          <p className="text-sm text-gray-500">
            {sale.name} · {isEstate ? 'Estate sale' : 'Auction'} · as of {new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>

        <Section title={`Items (${lots.length})`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Sold" value={String(recon.soldCount)} sub={`${recon.sellThrough}% sell-through`} strong />
            <Stat label={isEstate ? 'Still available' : 'Unsold (open)'} value={String(Math.max(0, s.open - (isEstate ? s.heldNow : 0)))} />
            {isEstate && <Stat label="In baskets / held" value={String(s.heldNow)} />}
            <Stat label={isEstate ? 'Returned to owner' : 'Returned'} value={String(s.returned)} />
            <Stat label="Charity" value={String(s.charity)} />
            <Stat label={isEstate ? 'Cleanout' : 'Discarded'} value={String(s.cleanout)} />
            {recon.refundCount > 0 && <Stat label="Refunded" value={String(recon.refundCount)} />}
          </div>
        </Section>

        <Section title="Catalog">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="With photos" value={photoLotIds ? `${photoLotIds.size}` : '…'} sub={photoLotIds ? pct(photoLotIds.size, lots.length) : undefined} />
            <Stat label="Priced" value={String(s.priced)} sub={pct(s.priced, lots.length)} />
            <Stat label="Described" value={String(s.described)} sub={pct(s.described, lots.length)} />
            {isEstate ? (
              <>
                <Stat label="Tag printed" value={String(s.tagged)} sub={pct(s.tagged, lots.length)} />
                <Stat label="Room assigned" value={String(s.located)} sub={pct(s.located, lots.length)} />
                <Stat label="Need a detail photo" value={String(s.needsDetail)} />
              </>
            ) : (
              showMoney && <Stat label="Estimates" value={`${money(s.estLow)} – ${money(s.estHigh)}`} />
            )}
          </div>
        </Section>

        {showMoney && (
          <Section title="Money">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {isEstate ? (
                <>
                  <Stat label="Gross sales" value={money(recon.grossBeforeRefunds)} />
                  <Stat label="Net sales" value={money(recon.grossHammer)} strong />
                </>
              ) : (
                <>
                  <Stat label="Gross hammer" value={money(recon.grossHammer)} strong />
                  <Stat label="Buyer's premium" value={money(recon.buyersPremium)} />
                </>
              )}
              {recon.refundsIssued > 0 && <Stat label="Refunds" value={money(recon.refundsIssued)} sub={`${recon.refundCount} item${recon.refundCount === 1 ? '' : 's'}`} />}
              <Stat label="Average sale" value={money(s.avg)} />
              <Stat label="Median sale" value={money(s.med)} />
              <Stat label="Highest sale" value={money(s.prices.length ? Math.max(...s.prices) : 0)} />
              {s.comparableCount > 0 && (
                <Stat
                  label={isEstate ? 'Sold vs asking price' : 'Hammer vs low estimate'}
                  value={pct(s.realisedSum, s.askSum)}
                  sub={`${money(s.realisedSum)} on ${money(s.askSum)}, ${s.comparableCount} items`}
                />
              )}
              <Stat label={isEstate ? 'Unsold at asking' : 'Unsold at low estimate'} value={money(s.openValue)} />
              <Stat label="House revenue" value={money(recon.houseRevenue)} />
              <Stat label={isEstate ? 'Owner payouts' : 'Consignor payouts'} value={money(recon.payoutsDue)} sub={`${money(recon.outstanding)} outstanding`} />
            </div>
          </Section>
        )}

        {isEstate && showMoney && (
          <Section title="Register">
            {reg.tickets === 0 ? (
              <p className="text-sm text-gray-400">No register sales yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Checkouts" value={String(reg.tickets)} sub={`${reg.buyers} buyer${reg.buyers === 1 ? '' : 's'}`} />
                  <Stat label="Taken in (with tax)" value={money(reg.total)} strong />
                  <Stat label="Sales tax collected" value={money(reg.tax)} />
                  <Stat label="Average checkout" value={money(reg.avgTicket)} sub={`${reg.itemsPerTicket.toFixed(1)} items each`} />
                  <Stat label="Carried out" value={String(reg.carry)} />
                  <Stat label="For delivery" value={String(reg.delivery)} />
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Payment types</p>
                    <div className="border border-gray-200 rounded-md divide-y divide-gray-100 text-sm">
                      {reg.tender.map(([k, v]) => (
                        <div key={k} className="flex justify-between px-3 py-1.5">
                          <span>{TENDER_LABELS[k] ?? k} <span className="text-gray-400">· {v.count}</span></span>
                          <span className="tabular-nums">{money(v.total)} <span className="text-gray-400">({pct(v.total, reg.total)})</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Checkouts by hour</p>
                    <div className="flex items-end gap-1 h-24 border-b border-gray-200">
                      {reg.hours.map(([h, n]) => (
                        <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${fmtHour(h)}: ${n}`}>
                          <span className="text-[10px] text-gray-500">{n}</span>
                          <div className="w-full bg-blue-500 rounded-t" style={{ height: `${(n / maxHour) * 80}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {reg.hours.map(([h]) => (
                        <span key={h} className="flex-1 text-center text-[10px] text-gray-400">{fmtHour(h)}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {reg.days.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-1">By day</p>
                    <div className="border border-gray-200 rounded-md divide-y divide-gray-100 text-sm">
                      {reg.days.map(([k, v]) => (
                        <div key={k} className="flex items-center gap-3 px-3 py-1.5">
                          <span className="w-28 shrink-0">{fmtDay(k)}</span>
                          <div className="flex-1 h-2 rounded bg-gray-100 hidden sm:block">
                            <div className="h-2 rounded bg-blue-500" style={{ width: `${(v.total / maxDay) * 100}%` }} />
                          </div>
                          <span className="text-gray-500 tabular-nums">{v.count} checkout{v.count === 1 ? '' : 's'}</span>
                          <span className="w-24 text-right tabular-nums">{money(v.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Section>
        )}

        {auctionBuyers && (
          <Section title="Buyers">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Winning buyers" value={String(auctionBuyers.count)} />
              <Stat label="Lots paid" value={String(auctionBuyers.paid)} sub={pct(auctionBuyers.paid, s.sold.length)} />
              <Stat label="Shipped / picked up" value={String(auctionBuyers.shipped)} sub={pct(auctionBuyers.shipped, s.sold.length)} />
              {showMoney && auctionBuyers.count > 0 && (
                <Stat label="Average per buyer" value={money(recon.grossHammer / auctionBuyers.count)} />
              )}
            </div>
            {showMoney && auctionBuyers.top.length > 0 && (
              <div className="mt-3 border border-gray-200 rounded-md divide-y divide-gray-100 text-sm">
                {auctionBuyers.top.map((b, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5">
                    <span>{b.name} <span className="text-gray-400">· {b.lots} lot{b.lots === 1 ? '' : 's'}</span></span>
                    <span className="tabular-nums">{money(b.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {byCategory.length > 0 && (
          <Section title="By category">
            <GroupTable rows={byCategory} showMoney={showMoney} />
          </Section>
        )}

        {isEstate && byRoom.length > 0 && (
          <Section title="By room">
            <GroupTable rows={byRoom} showMoney={showMoney} />
          </Section>
        )}

        {showMoney && s.top.length > 0 && (
          <Section title="Top sales">
            <div className="border border-gray-200 rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {s.top.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-1.5 text-gray-500 w-14">{l.lot_number ?? '—'}</td>
                      <td className="px-3 py-1.5">{l.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums w-28">{money(l.sold_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
