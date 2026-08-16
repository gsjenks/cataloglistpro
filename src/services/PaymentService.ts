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

// Revert an accidental payment back to unpaid (does not undo a 2nd-bidder price/buyer swap).
export async function markLotUnpaid(lotId: string): Promise<void> {
  await updateLot(lotId, { payment_status: 'unpaid' });
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
//
// Everything the ORIGINAL buyer left on the lot has to go with them. The lot is no
// longer on their LiveAuctioneers invoice (LA never billed this sale — it's a house
// transaction), and it must not travel on the shipment that was assigned for them.
// Leaving those behind is how a second-chance lot ends up shipping to the wrong
// address and printing someone else's invoice totals.
export async function secondBidderAccepted(
  lotId: string,
  buyer: LotBuyer,
  amount: number,
  buyersPremium?: number,
): Promise<void> {
  await updateLot(lotId, {
    payment_status: 'paid',
    sold_price: amount,
    buyer,
    buyers_premium: buyersPremium ?? null,
    la_invoice_id: null,
    fulfillment_carrier: null,
    fulfillment_method: null,
    tracking_number: null,
    shipped_at: null,
    delivered_at: null,
  });
}

// Buyer defaulted with no (or a declined) second chance → the lot falls to unsold,
// dropping into the disposition flow (D5).
export async function markDefaulted(lotId: string): Promise<void> {
  await updateLot(lotId, { payment_status: 'defaulted', outcome: 'passed' });
}
