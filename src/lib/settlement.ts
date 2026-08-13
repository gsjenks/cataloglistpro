// src/lib/settlement.ts
// Pure settlement math for a consignor (#2, D6). Consignor payout =
// Σ hammer (sold lots) − commission (rate% × gross) − fees. Commission is on hammer
// only; the house keeps 100% of the buyer's premium (not part of this). Only the
// final net is rounded. See docs/auction-lifecycle-spec.md.

import type { Consignment, Lot, ConsignmentFees } from '../types';

export interface SettlementLine {
  lotNumber: number | string | undefined;
  name: string;
  hammer: number;
}

export interface FeeLine {
  key: keyof ConsignmentFees;
  label: string;
  amount: number;
}

export interface Settlement {
  soldCount: number;
  unsoldCount: number;
  gross: number;               // Σ hammer of sold lots
  commissionRate: number;      // percent
  commission: number;          // gross × rate%
  fees: FeeLine[];
  feesTotal: number;
  net: number;                 // rounded to cents
  lines: SettlementLine[];     // sold lots, hammer desc
}

export const FEE_LABELS: Record<keyof ConsignmentFees, string> = {
  photography: 'Photography',
  cataloging: 'Cataloging',
  insurance: 'Insurance',
  storage: 'Storage',
  buyin: 'Buy-in',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Compute a consignor's settlement from their lots (lots already filtered to the
// consignment, or the full lot list — we filter by consignment_id here).
export function computeSettlement(consignment: Consignment, lots: Lot[]): Settlement {
  const mine = lots.filter((l) => l.consignment_id === consignment.id);
  const sold = mine.filter((l) => l.outcome === 'sold' || (l.sold_price ?? 0) > 0);
  const unsold = mine.filter((l) => !(l.outcome === 'sold' || (l.sold_price ?? 0) > 0));

  const lines: SettlementLine[] = sold
    .map((l) => ({ lotNumber: l.lot_number, name: l.name, hammer: l.sold_price ?? 0 }))
    .sort((a, b) => b.hammer - a.hammer);

  const gross = sold.reduce((s, l) => s + (l.sold_price ?? 0), 0);
  const commissionRate = consignment.commission_rate ?? 0;
  const commission = gross * (commissionRate / 100);

  const schedule = consignment.fee_schedule ?? {};
  const fees: FeeLine[] = (Object.keys(FEE_LABELS) as (keyof ConsignmentFees)[])
    .map((key) => ({ key, label: FEE_LABELS[key], amount: schedule[key] ?? 0 }))
    .filter((f) => f.amount > 0);
  const feesTotal = fees.reduce((s, f) => s + f.amount, 0);

  // Round only the final net (per the confirmed rule).
  const net = round2(gross - commission - feesTotal);

  return {
    soldCount: sold.length,
    unsoldCount: unsold.length,
    gross,
    commissionRate,
    commission,
    fees,
    feesTotal,
    net,
    lines,
  };
}
