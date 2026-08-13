// src/services/FulfillmentService.ts
// Stage 6 — fulfillment of paid lots: ship (with tracking) or pickup, and mark
// delivered. Actions apply to a set of lots (a buyer's shipment usually spans several).

import { supabase } from '../lib/supabase';

async function updateLots(lotIds: string[], patch: Record<string, unknown>): Promise<void> {
  if (!lotIds.length) return;
  const { error } = await supabase.from('lots').update(patch).in('id', lotIds);
  if (error) throw error;
}

export async function shipLots(lotIds: string[], tracking: string): Promise<void> {
  await updateLots(lotIds, {
    fulfillment_method: 'ship',
    tracking_number: tracking.trim() || null,
    shipped_at: new Date().toISOString(),
  });
}

export async function markPickedUp(lotIds: string[]): Promise<void> {
  await updateLots(lotIds, {
    fulfillment_method: 'pickup',
    delivered_at: new Date().toISOString(),
  });
}

export async function markDelivered(lotIds: string[]): Promise<void> {
  await updateLots(lotIds, { delivered_at: new Date().toISOString() });
}

// Undo — back to pending fulfillment.
export async function resetFulfillment(lotIds: string[]): Promise<void> {
  await updateLots(lotIds, {
    fulfillment_method: null,
    tracking_number: null,
    shipped_at: null,
    delivered_at: null,
  });
}
