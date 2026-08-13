// src/services/PaymentService.ts
// D4 — payment resolution for sold lots (spec §4.1). Sold lots import as unpaid with
// a 72h due date; this drives them to paid, second-chance, or defaulted→unsold.

import { supabase } from '../lib/supabase';
import type { LotBuyer } from '../types';

async function updateLot(lotId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('lots').update(patch).eq('id', lotId);
  if (error) throw error;
}

export async function markLotPaid(lotId: string): Promise<void> {
  await updateLot(lotId, { payment_status: 'paid' });
}

// Bulk-clear the historical/settled backlog: every sold+unpaid lot on a sale → paid.
export async function markAllPaid(saleId: string): Promise<number> {
  const { data, error } = await supabase
    .from('lots')
    .update({ payment_status: 'paid' })
    .eq('sale_id', saleId)
    .eq('outcome', 'sold')
    .neq('payment_status', 'paid')
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

// Record a second-chance offer to the underbidder (manual entry — LA omits them).
export async function offerSecondBidder(lotId: string, contact: string, amount: number): Promise<void> {
  await updateLot(lotId, {
    payment_status: 'second_chance',
    second_bidder_contact: contact,
    second_bidder_amount: amount,
  });
}

// The underbidder accepted: the sale price + buyer become theirs, lot is paid.
export async function secondBidderAccepted(lotId: string, contact: string, amount: number): Promise<void> {
  const buyer: LotBuyer = { name: contact };
  await updateLot(lotId, {
    payment_status: 'paid',
    sold_price: amount,
    buyer,
  });
}

// Buyer defaulted with no (or a declined) second chance → the lot falls to unsold,
// dropping into the disposition flow (D5).
export async function markDefaulted(lotId: string): Promise<void> {
  await updateLot(lotId, { payment_status: 'defaulted', outcome: 'passed' });
}
