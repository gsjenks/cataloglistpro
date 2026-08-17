// src/services/BuyerService.ts
// Edit the buyer recorded on lots. LiveAuctioneers-imported buyers arrive complete,
// but a second-chance or aftersale buyer is entered by hand — and anything captured
// before there was somewhere to type an address needs fixing up.

import { supabase } from '../lib/supabase';
import type { LotBuyer } from '../types';

// Applies to every lot in a buyer's shipment at once — they share one address.
//
// `detachFromLaInvoice` repairs lots sold on a second chance or aftersale before those
// flows cleared up after themselves: the lot still points at the ORIGINAL buyer's
// LiveAuctioneers invoice and shipment, so it prints their totals and travels with
// their parcels. Opt-in, because an LA-imported buyer's invoice link is legitimate.
export async function updateBuyerForLots(
  lotIds: string[],
  buyer: LotBuyer,
  detachFromLaInvoice = false,
): Promise<void> {
  if (!lotIds.length) return;
  const patch: Record<string, unknown> = { buyer };
  if (detachFromLaInvoice) {
    Object.assign(patch, {
      la_invoice_id: null,
      fulfillment_carrier: null,
      fulfillment_method: null,
      tracking_number: null,
      shipped_at: null,
      delivered_at: null,
    });
  }
  const { error } = await supabase.from('lots').update(patch).in('id', lotIds);
  if (error) throw error;
}
