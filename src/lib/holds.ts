// src/lib/holds.ts
// Buyer-basket hold helpers (Phase 4a). Holds are placed/released through
// SECURITY DEFINER RPCs (see the phase4a migration) so anonymous buyers can
// hold items without direct write access to the lots table.

import type { SupabaseClient } from '@supabase/supabase-js';

export const HOLD_MINUTES = 30;

export type HoldError =
  | 'not_found'
  | 'checkout_closed'
  | 'sold'
  | 'held_by_other'
  | 'not_held_by_you'
  | 'unknown';

export interface HoldResult {
  success: boolean;
  heldUntil?: string;
  error?: HoldError;
}

export async function holdLot(
  client: SupabaseClient,
  lotId: string,
  basketId: string,
): Promise<HoldResult> {
  const { data, error } = await client.rpc('hold_lot', { p_lot_id: lotId, p_basket_id: basketId });
  if (error) return { success: false, error: 'unknown' };
  const d = data as { success: boolean; held_until?: string; error?: HoldError };
  return { success: d.success, heldUntil: d.held_until, error: d.error };
}

export async function releaseLot(
  client: SupabaseClient,
  lotId: string,
  basketId: string,
): Promise<HoldResult> {
  const { data, error } = await client.rpc('release_lot', { p_lot_id: lotId, p_basket_id: basketId });
  if (error) return { success: false, error: 'unknown' };
  const d = data as { success: boolean; error?: HoldError };
  return { success: d.success, error: d.error };
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
