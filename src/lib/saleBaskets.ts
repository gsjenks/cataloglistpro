// src/lib/saleBaskets.ts
// Associates a shopper's basket with a sale (see migration 20260817000001).
// Lets the Shopper Baskets tab list every basket worked in a sale — even empty
// or checked-out ones — since shoppers themselves aren't sale-scoped.

import type { SupabaseClient } from '@supabase/supabase-js';

// Record (or refresh) that a shopper's basket belongs to this sale. Best-effort:
// this is bookkeeping, so a failure must never block the caller's real action.
export async function touchSaleBasket(
  supabase: SupabaseClient,
  saleId: string | null | undefined,
  shopperId: string | null | undefined,
  companyId?: string | null,
): Promise<void> {
  if (!saleId || !shopperId) return;
  try {
    await supabase.from('sale_baskets').upsert(
      {
        sale_id: saleId,
        shopper_id: shopperId,
        company_id: companyId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sale_id,shopper_id' },
    );
  } catch {
    /* non-fatal bookkeeping */
  }
}
