// src/lib/settlement.ts
// Pure settlement math for a consignor (#2, D6). Consignor payout =
// Σ hammer (sold lots) − commission (rate% × gross) − fees. Commission is on hammer
// only; the house keeps 100% of the buyer's premium (not part of this). Buy-in is a
// rate (default 3%) charged on each UNSOLD lot's reserve. Only the final net is
// rounded. See docs/auction-lifecycle-spec.md.

import type { Consignment, Lot, ConsignmentFees } from '../types';

export interface SettlementLine {
  lotNumber: number | string | undefined;
  name: string;
  hammer: number;
}

export interface UnsoldLine {
  lotNumber: number | string | undefined;
  name: string;
  estimateLow?: number;
  estimateHigh?: number;
  reserve?: number;      // reserve_price, if one was set
  buyinCharge: number;   // buyinRate% × reserve (0 when the lot has no reserve)
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
  unsoldLots: UnsoldLine[];    // passed lots (buy-in applies to those with a reserve)
  buyinRate: number;           // percent applied to each unsold lot's reserve
}

// Flat per-consignment fees (dollar amounts). Buy-in is NOT here — it's computed
// per unsold lot from reserves.
export const FLAT_FEE_KEYS: (keyof ConsignmentFees)[] = ['photography', 'cataloging', 'insurance', 'storage'];

export const FEE_LABELS: Record<keyof ConsignmentFees, string> = {
  photography: 'Photography',
  cataloging: 'Cataloging',
  insurance: 'Insurance',
  storage: 'Storage',
  buyin: 'Buy-in',
};

export const DEFAULT_BUYIN_RATE = 3; // percent of reserve, on unsold lots

const round2 = (n: number) => Math.round(n * 100) / 100;
const lotNum = (v: number | string | undefined) =>
  typeof v === 'number' ? v : parseInt(String(v ?? ''), 10) || 0;

export function computeSettlement(consignment: Consignment, lots: Lot[]): Settlement {
  const mine = lots.filter((l) => l.consignment_id === consignment.id);
  const sold = mine.filter((l) => l.outcome === 'sold' || (l.sold_price ?? 0) > 0);
  const unsold = mine.filter((l) => !(l.outcome === 'sold' || (l.sold_price ?? 0) > 0));

  const lines: SettlementLine[] = sold
    .map((l) => ({ lotNumber: l.lot_number, name: l.name, hammer: l.sold_price ?? 0 }))
    .sort((a, b) => b.hammer - a.hammer);

  const schedule = consignment.fee_schedule ?? {};
  const buyinRate = schedule.buyin ?? DEFAULT_BUYIN_RATE;

  const unsoldLots: UnsoldLine[] = unsold
    .map((l) => {
      const reserve = l.reserve_price;
      const buyinCharge = reserve && reserve > 0 ? (buyinRate / 100) * reserve : 0;
      return {
        lotNumber: l.lot_number,
        name: l.name,
        estimateLow: l.estimate_low,
        estimateHigh: l.estimate_high,
        reserve,
        buyinCharge,
      };
    })
    .sort((a, b) => lotNum(a.lotNumber) - lotNum(b.lotNumber));
  const buyinTotal = unsoldLots.reduce((s, u) => s + u.buyinCharge, 0);

  const gross = sold.reduce((s, l) => s + (l.sold_price ?? 0), 0);
  const commissionRate = consignment.commission_rate ?? 0;
  const commission = gross * (commissionRate / 100);

  const fees: FeeLine[] = FLAT_FEE_KEYS.map((key) => ({
    key,
    label: FEE_LABELS[key],
    amount: schedule[key] ?? 0,
  })).filter((f) => f.amount > 0);
  if (buyinTotal > 0) {
    fees.push({ key: 'buyin', label: `Buy-in (${buyinRate}% of reserves)`, amount: buyinTotal });
  }
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
    unsoldLots,
    buyinRate,
  };
}
