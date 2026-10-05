// src/lib/holds.ts
// Buyer-basket hold helpers (Phase 4a). Holds are placed/released through
// SECURITY DEFINER RPCs so anonymous buyers can hold items without access to
// the lots table. The buyer-side RPCs take the shopper's TOKEN (issued by the
// shopper-verify function), never the bare shopper id — see migration
// 20261004000000_lots_public_access. lots.held_by is still the shopper id.

import type { SupabaseClient } from '@supabase/supabase-js';

export const HOLD_MINUTES = 30;
export const HOLD_MS = HOLD_MINUTES * 60 * 1000;

/**
 * Renew EVERY live hold in a basket to a fresh timer. Called on any basket
 * activity (adding an item) so a shopper's whole basket resets together — one
 * item shouldn't expire while they're still actively adding others. Best-effort;
 * only touches lots currently held by this basket in this sale (staff client,
 * which can write lots). Returns the number of holds renewed.
 */
export async function renewBasketHolds(
  client: SupabaseClient,
  saleId: string,
  basketId: string | null | undefined,
): Promise<number> {
  if (!saleId || !basketId) return 0;
  try {
    const { data } = await client
      .from('lots')
      .update({
        held_until: new Date(Date.now() + HOLD_MS).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('sale_id', saleId)
      .eq('held_by', basketId)
      .eq('inventory_status', 'held')
      .select('id');
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}

export type HoldError =
  | 'not_found'
  | 'checkout_closed'
  | 'sold'
  | 'held_by_other'
  | 'not_held_by_you'
  | 'invalid_token'
  | 'unknown';

export interface HoldResult {
  success: boolean;
  heldUntil?: string;
  error?: HoldError;
}

export async function holdLot(
  client: SupabaseClient,
  lotId: string,
  token: string,
): Promise<HoldResult> {
  const { data, error } = await client.rpc('hold_lot', { p_lot_id: lotId, p_token: token });
  if (error) return { success: false, error: 'unknown' };
  const d = data as { success: boolean; held_until?: string; error?: HoldError };
  return { success: d.success, heldUntil: d.held_until, error: d.error };
}

export async function releaseLot(
  client: SupabaseClient,
  lotId: string,
  token: string,
): Promise<HoldResult> {
  const { data, error } = await client.rpc('release_lot', { p_lot_id: lotId, p_token: token });
  if (error) return { success: false, error: 'unknown' };
  const d = data as { success: boolean; error?: HoldError };
  return { success: d.success, error: d.error };
}

/**
 * Reset every live hold in the token's basket for a sale to a fresh 30 minutes
 * (buyer side; the staff equivalent is renewBasketHolds). Never revives an
 * expired hold.
 */
export async function renewMyBasket(
  client: SupabaseClient,
  saleId: string,
  token: string,
): Promise<HoldResult> {
  const { data, error } = await client.rpc('renew_my_basket', { p_sale_id: saleId, p_token: token });
  if (error) return { success: false, error: 'unknown' };
  const d = data as { success: boolean; held_until?: string; error?: HoldError };
  return { success: d.success, heldUntil: d.held_until, error: d.error };
}

/**
 * Reclaim expired buyer holds in a sale: any lot still marked `held` whose
 * `held_until` is in the past is returned to `available` and its hold cleared.
 * Requires a client with write access to lots (i.e. the authenticated staff
 * client) — RLS blocks the anonymous buyer client from updating lots.
 * Staff/indefinite holds (held_until IS NULL) are left untouched.
 * Returns the number of lots reclaimed (best-effort; 0 on error).
 */
export async function reclaimExpiredHolds(
  client: SupabaseClient,
  saleId: string,
): Promise<number> {
  const { data, error } = await client
    .from('lots')
    .update({
      inventory_status: 'available',
      held_by: null,
      held_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('sale_id', saleId)
    .eq('inventory_status', 'held')
    .lt('held_until', new Date().toISOString())
    .select('id');
  if (error) {
    console.warn('reclaimExpiredHolds failed (non-fatal):', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Effective availability for display: an expired hold counts as available.
 */
export function effectiveStatus(
  inventoryStatus: string | null | undefined,
  heldUntil: string | null | undefined,
  now: Date = new Date(),
): 'available' | 'held' | 'sold' {
  const status = (inventoryStatus ?? 'available') as 'available' | 'held' | 'sold';
  if (status === 'held' && heldUntil && new Date(heldUntil).getTime() <= now.getTime()) {
    return 'available';
  }
  return status;
}
