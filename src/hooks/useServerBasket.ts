// src/hooks/useServerBasket.ts
// Server-backed shared basket. A basket IS the set of lots held_by a basket id
// (the id is a verified shopper id, or a ?b=<id> from a shared link). Contents
// load from the server and stay live via realtime, so the buyer's phone, a
// shared link, and staff all see the same basket. If no basket id is provided
// (shopper not registered yet), the basket is empty and adds are refused.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabasePublic } from '../lib/publicClient';
import { holdLot, releaseLot, type HoldResult } from '../lib/holds';
import type { BasketItem } from './useBuyerBasket';

interface LotRow {
  id: string;
  lot_number: number | string | null;
  name: string;
  starting_bid: number | null;
  held_until: string | null;
}

// Renewing on every page view/focus would be wasteful, so throttle activity-
// driven renewals to at most once per basket per window (module-level so it
// survives page navigation, which remounts the hook).
const RENEW_THROTTLE_MS = 2 * 60 * 1000;
const lastRenewAt = new Map<string, number>();

export function useServerBasket(saleId?: string, basketId?: string) {
  const [items, setItems] = useState<BasketItem[]>([]);

  const load = useCallback(async () => {
    if (!saleId || !basketId) {
      setItems([]);
      return;
    }
    const { data } = await supabasePublic
      .from('lots')
      .select('id, lot_number, name, starting_bid, held_until, inventory_status, held_by')
      .eq('sale_id', saleId)
      .eq('held_by', basketId)
      .eq('inventory_status', 'held');
    const now = Date.now();
    const mapped = ((data as LotRow[] | null) || [])
      .filter((l) => l.held_until && new Date(l.held_until).getTime() > now)
      .map((l) => ({
        lotId: l.id,
        lotNumber: l.lot_number,
        name: l.name,
        price: l.starting_bid ?? 0,
        heldUntil: l.held_until as string,
      }));
    setItems(mapped);
  }, [saleId, basketId]);

  // Any shopper activity (viewing a lot, opening the basket, returning to the
  // app) means they're still shopping, so push every live hold back to a fresh
  // 30 minutes. Fetches its own list so it works right after mount (before
  // `items` state has settled) and never resurrects an already-expired hold.
  const renewAll = useCallback(
    async (force = false) => {
      if (!saleId || !basketId) return;
      const now = Date.now();
      if (!force && now - (lastRenewAt.get(basketId) ?? 0) < RENEW_THROTTLE_MS) return;
      lastRenewAt.set(basketId, now);
      const { data } = await supabasePublic
        .from('lots')
        .select('id, held_until, inventory_status, held_by')
        .eq('sale_id', saleId)
        .eq('held_by', basketId)
        .eq('inventory_status', 'held');
      const live = ((data as { id: string; held_until: string | null }[] | null) || []).filter(
        (l) => l.held_until && new Date(l.held_until).getTime() > Date.now(),
      );
      if (live.length) {
        await Promise.all(live.map((l) => holdLot(supabasePublic, l.id, basketId)));
        await load();
      }
    },
    [saleId, basketId, load],
  );

  // On mount / when the basket becomes known: load, then renew (still shopping).
  useEffect(() => {
    load();
    renewAll();
  }, [load, renewAll]);

  // Live: any lot change in this sale may affect this basket → reload.
  useEffect(() => {
    if (!saleId || !basketId) return;
    const channel = supabasePublic
      .channel(`basket:${saleId}:${basketId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lots', filter: `sale_id=eq.${saleId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabasePublic.removeChannel(channel);
    };
  }, [saleId, basketId, load]);

  // Mobile browsers suspend background tabs and drop the realtime socket, so a
  // change made on another device can be missed. Reload whenever this page
  // regains focus/visibility so the basket is fresh when the shopper returns.
  useEffect(() => {
    if (!saleId || !basketId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') renewAll();
    };
    const onFocus = () => renewAll();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [saleId, basketId, renewAll]);

  // Keep holds alive while a page using this basket stays open (every 10 min).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!saleId || !basketId) return;
    const t = setInterval(() => renewAll(true), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [saleId, basketId, renewAll]);

  const add = useCallback(
    async (lotId: string): Promise<HoldResult> => {
      if (!basketId) return { success: false, error: 'unknown' };
      const res = await holdLot(supabasePublic, lotId, basketId);
      if (res.success) {
        // Adding an item is proof the shopper is still shopping, so reset the
        // hold timer on everything already in the basket too — otherwise an
        // item added earlier could quietly expire while they keep browsing.
        await Promise.all(
          itemsRef.current
            .filter((it) => it.lotId !== lotId)
            .map((it) => holdLot(supabasePublic, it.lotId, basketId)),
        );
        await load();
      }
      return res;
    },
    [basketId, load],
  );

  const remove = useCallback(
    async (lotId: string) => {
      if (!basketId) return;
      await releaseLot(supabasePublic, lotId, basketId);
      await load();
    },
    [basketId, load],
  );

  const has = useCallback((lotId: string) => items.some((i) => i.lotId === lotId), [items]);
  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  return { basketId: basketId ?? '', items, add, remove, has, total, reload: load };
}
