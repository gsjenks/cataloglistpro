// src/lib/saleBaskets.ts
// Associates a shopper's basket with a sale (see migration 20260817000001).
// Lets the Shopper Baskets tab list every basket worked in a sale — even empty
// or checked-out ones — since shoppers themselves aren't sale-scoped.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SaleBasketShopper {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface SaleBasketRow {
  shopper: SaleBasketShopper;
  count: number; // held items in this sale
  total: number; // value of held items
  expires: number | null; // soonest hold expiry (ms), null if not holding
  status: 'holding' | 'checkedout' | 'empty';
}

// Load every basket associated with a sale, with its live status. Used by both
// the Baskets tool and the register so the two stay consistent. Best-effort:
// returns [] (rather than throwing) if the sale_baskets table isn't migrated.
export async function loadSaleBaskets(
  supabase: SupabaseClient,
  saleId: string,
  nowMs: number = Date.now(),
): Promise<SaleBasketRow[]> {
  if (!saleId) return [];
  try {
    const [assocRes, lotsRes, txnRes] = await Promise.all([
      supabase.from('sale_baskets').select('shopper_id').eq('sale_id', saleId),
      supabase.from('lots').select('held_by, held_until, inventory_status, starting_bid').eq('sale_id', saleId),
      supabase.from('sales_transactions').select('buyer_name, shopper_id').eq('sale_id', saleId).eq('status', 'completed'),
    ]);

    // Live holds grouped by holder.
    const held = new Map<string, { count: number; total: number; expires: number }>();
    for (const l of (lotsRes.data as { held_by: string | null; held_until: string | null; inventory_status: string | null; starting_bid: number | null }[] | null) || []) {
      const live = l.inventory_status === 'held' && !!l.held_until && new Date(l.held_until).getTime() > nowMs;
      if (!l.held_by || !live) continue;
      const exp = new Date(l.held_until as string).getTime();
      const e = held.get(l.held_by) ?? { count: 0, total: 0, expires: exp };
      e.count += 1;
      e.total += l.starting_bid || 0;
      e.expires = Math.min(e.expires, exp);
      held.set(l.held_by, e);
    }

    const assocIds = ((assocRes.data as { shopper_id: string }[] | null) || []).map((a) => a.shopper_id);
    const ids = new Set<string>([...assocIds, ...held.keys()]);
    if (!ids.size) return [];

    const { data: shoppers } = await supabase.from('shoppers').select('id, name, email, phone').in('id', [...ids]);

    const txns = (txnRes.data as { buyer_name: string | null; shopper_id: string | null }[] | null) || [];
    const checkedOutIds = new Set(txns.map((t) => t.shopper_id).filter(Boolean) as string[]);
    const checkedOutNames = new Set(txns.map((t) => (t.buyer_name || '').trim().toLowerCase()).filter(Boolean));

    const rows: SaleBasketRow[] = ((shoppers as SaleBasketShopper[] | null) || []).map((s) => {
      const h = held.get(s.id);
      if (h) return { shopper: s, count: h.count, total: h.total, expires: h.expires, status: 'holding' };
      const co = checkedOutIds.has(s.id) || checkedOutNames.has((s.name || '').trim().toLowerCase());
      return { shopper: s, count: 0, total: 0, expires: null, status: co ? 'checkedout' : 'empty' };
    });

    const rank = (st: SaleBasketRow['status']) => (st === 'holding' ? 0 : st === 'checkedout' ? 1 : 2);
    return rows.sort((a, b) =>
      rank(a.status) - rank(b.status) ||
      (a.expires != null && b.expires != null ? a.expires - b.expires : 0) ||
      a.shopper.name.localeCompare(b.shopper.name),
    );
  } catch {
    return [];
  }
}

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
