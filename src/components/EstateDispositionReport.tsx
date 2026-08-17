// src/components/EstateDispositionReport.tsx
// Whole-sale disposition report for an estate sale: what happened to every lot —
// Sold (to whom, price, carry/delivery), Returned to owner, Charity, Cleanout,
// and still-unsold — plus the refund log. Printable.

import { useEffect, useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Lot } from '../types';
import { getRefunds, type RefundRecord } from '../services/RefundService';

interface Props {
  saleId: string;
  saleName: string;
  lots: Lot[];
  onBack?: () => void;
}

const money = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

interface SoldInfo { buyer: string | null; fulfillment: string | null }

export default function EstateDispositionReport({ saleId, saleName, lots, onBack }: Props) {
  const [soldInfo, setSoldInfo] = useState<Record<string, SoldInfo>>({});
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);

  const sold = lots.filter((l) => l.inventory_status === 'sold');
  const returned = lots.filter((l) => l.disposition === 'returned');
  const charity = lots.filter((l) => l.disposition === 'charity');
  const cleanout = lots.filter((l) => l.disposition === 'discarded');
  const unsold = lots.filter((l) => l.inventory_status !== 'sold' && !l.disposition);

  const soldKey = sold.map((l) => l.id).sort().join(',');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      getRefunds(saleId).then((r) => { if (!cancelled) setRefunds(r); });
      const ids = soldKey ? soldKey.split(',') : [];
      if (!ids.length) { if (!cancelled) setSoldInfo({}); return; }
      const { data: items } = await supabase
        .from('sales_transaction_items')
        .select('lot_id, transaction_id, fulfillment')
        .in('lot_id', ids);
      const rows = (items as { lot_id: string; transaction_id: string; fulfillment: string | null }[] | null) || [];
      const txnIds = [...new Set(rows.map((r) => r.transaction_id))];
      const buyerByTxn = new Map<string, string | null>();
      if (txnIds.length) {
        const { data: txns } = await supabase.from('sales_transactions').select('id, buyer_name').in('id', txnIds);
        ((txns as { id: string; buyer_name: string | null }[] | null) || []).forEach((t) => buyerByTxn.set(t.id, t.buyer_name));
      }
      const map: Record<string, SoldInfo> = {};
      rows.forEach((r) => { map[r.lot_id] = { buyer: buyerByTxn.get(r.transaction_id) ?? null, fulfillment: r.fulfillment }; });
      if (!cancelled) setSoldInfo(map);
    })();
    return () => { cancelled = true; };
  }, [soldKey, saleId]);

  const soldTotal = sold.reduce((s, l) => s + (l.sold_price ?? 0), 0);
  const refundsTotal = refunds.reduce((s, r) => s + (r.amount ?? 0), 0);
  const Row = ({ lot, extra }: { lot: Lot; extra?: React.ReactNode }) => (
    <tr>
      <td className="px-3 py-1.5 text-gray-500 w-14">{lot.lot_number ?? '—'}</td>
      <td className="px-3 py-1.5">{lot.name}</td>
      <td className="px-3 py-1.5">{extra}</td>
      <td className="px-3 py-1.5 text-right tabular-nums w-24">{money(lot.sold_price ?? lot.starting_bid)}</td>
    </tr>
  );

  const Section = ({ title, rows, kind }: { title: string; rows: Lot[]; kind: 'sold' | 'dispo' | 'unsold' }) => (
    <div className="report-section">
      <div className="flex items-baseline justify-between mt-5 mb-1">
        <h3 className="text-sm font-semibold text-gray-900">{title} ({rows.length})</h3>
        {kind === 'sold' && rows.length > 0 && <span className="text-sm font-medium text-gray-700">{money(rows.reduce((s, l) => s + (l.sold_price ?? 0), 0))}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">None.</p>
      ) : (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {rows.map((l) => (
                <Row
                  key={l.id}
                  lot={l}
                  extra={
                    kind === 'sold'
                      ? <span className="text-gray-600">{soldInfo[l.id]?.buyer || '—'}{soldInfo[l.id]?.fulfillment === 'delivery' ? ' · delivery' : soldInfo[l.id] ? ' · carry' : ''}</span>
                      : kind === 'dispo'
                      ? <span className="text-gray-500 text-xs">{l.disposition_note || ''}</span>
                      : null
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden !important; } #dispo-report, #dispo-report * { visibility: visible !important; } #dispo-report { position: absolute; inset: 0; margin: 0; } .no-print { display: none !important; } .report-section { break-inside: avoid; } }`}</style>

      <div className="no-print flex items-center justify-between">
        {onBack ? (
          <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to tools
          </button>
        ) : <span />}
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
          <Printer className="w-4 h-4" /> Print report
        </button>
      </div>

      <div id="dispo-report" className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="border-b border-gray-200 pb-3 mb-2">
          <h2 className="text-xl font-bold text-gray-900">Estate Sale Disposition Report</h2>
          <p className="text-sm text-gray-500">{saleName}</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border border-gray-200 p-2"><p className="text-xs text-gray-500">Sold</p><p className="font-semibold text-gray-900">{sold.length} · {money(soldTotal)}</p></div>
          <div className="rounded-md border border-gray-200 p-2"><p className="text-xs text-gray-500">Returned to owner</p><p className="font-semibold text-gray-900">{returned.length}</p></div>
          <div className="rounded-md border border-gray-200 p-2"><p className="text-xs text-gray-500">Charity</p><p className="font-semibold text-gray-900">{charity.length}</p></div>
          <div className="rounded-md border border-gray-200 p-2"><p className="text-xs text-gray-500">Cleanout</p><p className="font-semibold text-gray-900">{cleanout.length}</p></div>
          <div className="rounded-md border border-gray-200 p-2"><p className="text-xs text-gray-500">Unsold (open)</p><p className="font-semibold text-gray-900">{unsold.length}</p></div>
          <div className="rounded-md border border-gray-200 p-2"><p className="text-xs text-gray-500">Refunds</p><p className="font-semibold text-gray-900">{refunds.length} · {money(refundsTotal)}</p></div>
        </div>

        <Section title="Sold" rows={sold} kind="sold" />
        <Section title="Returned to owner" rows={returned} kind="dispo" />
        <Section title="Charity" rows={charity} kind="dispo" />
        <Section title="Cleanout" rows={cleanout} kind="dispo" />
        <Section title="Unsold — still available" rows={unsold} kind="unsold" />

        {refunds.length > 0 && (
          <div className="report-section mt-5">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-900">Refunds ({refunds.length})</h3>
              <span className="text-sm font-medium text-gray-700">{money(refundsTotal)}</span>
            </div>
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-1.5 text-gray-500 w-14">{r.lot_number ?? '—'}</td>
                      <td className="px-3 py-1.5">{r.lot_name || 'Item'}</td>
                      <td className="px-3 py-1.5 text-gray-600">{r.buyer_name || ''}{r.reason ? ` · ${r.reason}` : ''}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums w-24">− {money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-6">
          {lots.length} lots total · generated from live sale data.
        </p>
      </div>
    </div>
  );
}
