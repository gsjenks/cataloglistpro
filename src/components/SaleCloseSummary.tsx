// src/components/SaleCloseSummary.tsx
// Stage 8 (Close) wrap-up. Shown once a sale reaches the `closed` stage: a final
// summary of the money and every lot's outcome, plus an Archive action that
// stamps the stage's `archived` checklist item. Advancing to `closed` already set
// sales.status = 'completed' (SaleStageService); this is the human-facing recap.

import { useEffect, useState } from 'react';
import { CheckCircle2, Archive, DollarSign, Package } from 'lucide-react';
import type { Sale, Lot, Consignment } from '../types';
import { computeReconciliation } from '../lib/reconciliation';
import { getRefunds } from '../services/RefundService';
import { setSaleChecklistItem } from '../services/SaleStageService';

interface Props {
  sale: Sale;
  lots: Lot[];
  consignments: Consignment[];
  consignorNames: Record<string, string>;
  saleType?: 'estate_sale' | 'auction' | 'social';
  onChanged: () => void;
}

const money = (n?: number | null) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-gray-200 p-3 bg-white">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-gray-900 ${strong ? 'text-lg font-bold' : 'font-semibold'}`}>{value}</p>
    </div>
  );
}

export default function SaleCloseSummary({ sale, lots, consignments, consignorNames, saleType, onChanged }: Props) {
  const isEstate = saleType === 'estate_sale';
  const [refundTotal, setRefundTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  const recon = computeReconciliation(consignments, lots, consignorNames);
  const archived = !!sale.stage_progress?.items?.archived?.done;

  const returned = lots.filter((l) => l.disposition === 'returned').length;
  const charity = lots.filter((l) => l.disposition === 'charity').length;
  const cleanout = lots.filter((l) => l.disposition === 'discarded').length;

  useEffect(() => {
    let live = true;
    getRefunds(sale.id).then((r) => { if (live) setRefundTotal(r.reduce((s, x) => s + (x.amount ?? 0), 0)); });
    return () => { live = false; };
  }, [sale.id]);

  const archive = async () => {
    setBusy(true);
    try {
      await setSaleChecklistItem(sale.id, sale.stage_progress, 'archived', { done: true });
      onChanged();
    } catch (e) {
      console.error('Archive failed:', e);
      alert('Could not archive the sale.');
    } finally {
      setBusy(false);
    }
  };

  const netSales = recon.grossHammer - refundTotal;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sale wrap-up</h2>
          <p className="text-sm text-gray-500">{sale.name} — this sale is complete.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
          <CheckCircle2 className="w-4 h-4" /> Completed
        </span>
      </div>

      {/* Money */}
      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1.5 mb-2">
          <DollarSign className="w-3.5 h-3.5" /> Money
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {isEstate ? (
            <>
              <Stat label="Gross sales" value={money(recon.grossHammer)} />
              <Stat label="Net sales" value={money(netSales)} />
            </>
          ) : (
            <>
              <Stat label="Gross hammer" value={money(recon.grossHammer)} />
              <Stat label="Buyer's premium" value={money(recon.buyersPremium)} />
            </>
          )}
          <Stat label="Commission" value={money(recon.commission)} />
          <Stat label="Fees billed" value={money(recon.feesCharged)} />
          <Stat label="House revenue" value={money(recon.houseRevenue)} strong />
          <Stat label={isEstate ? 'Owner payouts' : 'Consignor payouts'} value={money(recon.payoutsDue)} />
          <Stat label="Paid out" value={money(recon.paidOut)} />
          <Stat label="Outstanding" value={money(recon.outstanding)} strong />
          {refundTotal > 0 && <Stat label="Refunds" value={money(refundTotal)} />}
        </div>
      </div>

      {/* Item outcomes */}
      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1.5 mb-2">
          <Package className="w-3.5 h-3.5" /> Items ({recon.lotCount})
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Sold" value={`${recon.soldCount} · ${money(recon.grossHammer)}`} />
          <Stat label="Sell-through" value={`${recon.sellThrough}%`} />
          <Stat label={isEstate ? 'Returned to owner' : 'Returned'} value={String(returned)} />
          <Stat label="Charity" value={String(charity)} />
          <Stat label={isEstate ? 'Cleanout' : 'Discarded'} value={String(cleanout)} />
          <Stat label="Unsold (open)" value={String(recon.unsoldCount - returned - charity - cleanout)} />
        </div>
      </div>

      {/* Where the records live */}
      <p className="mt-4 text-xs text-gray-500">
        Keep the records from <span className="font-medium">Reports &amp; Tools</span>
        {isEstate ? ' (Disposition Report)' : ''} and the <span className="font-medium">Reconciliation</span> tab
        (Accounting CSV, settlement statements). Archiving marks the sale wrapped; its data stays available.
      </p>

      {/* Archive action */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
        {archived ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600">
            <Archive className="w-4 h-4" /> Archived
          </span>
        ) : (
          <button
            onClick={archive}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-md hover:bg-gray-900 disabled:opacity-50"
          >
            <Archive className="w-4 h-4" /> {busy ? 'Archiving…' : 'Archive sale'}
          </button>
        )}
      </div>
    </div>
  );
}
