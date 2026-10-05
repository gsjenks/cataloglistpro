// src/hooks/useServerBasket.ts
// Server-backed shared basket. A basket IS the set of lots held_by a shopper id.
// Buyer pages cannot read lots directly, so contents come from my_basket(), which
// needs the shopper's token (from this device's verification, or the t= of a
// saved basket link). Contents stay live via the sale's lot_changed broadcast,
// so the buyer's phone, a saved link, and staff all see the same basket. With no
// token (shopper not verified yet) the basket is empty and adds are refused.

import { useCallback, useEffect, useState } from 'react';
import { supabasePublic } from '../lib/publicClient';
import { holdLot, releaseLot, renewMyBasket, type HoldResult } from '../lib/holds';
import { subscribeSaleLots } from '../lib/publicLots';
import type { BasketItem } from './useBuyerBasket';

interface BasketRow {
  id: string;
  lot_number: number | string | null;
  name: string;
  starting_bid: number | null;
  held_until: string;
}

interface MyBasketResponse {
  success: boolean;
  error?: string;
  shopper_id?: string;
  name?: string | null;
  items?: BasketRow[];
}

// Renewing on every page view/focus would be wasteful, so throttle activity-
// driven renewals to at most once per basket per window (module-level so it
// survives page navigation, which remounts the hook).
const RENEW_THROTTLE_MS = 2 * 60 * 1000;
const lastRenewAt = new Map<string, number>();

export function useServerBasket(saleId?: string, token?: string | null) {
  const [items, setItems] = useState<BasketItem[]>([]);
  const [shopperId, setShopperId] = useState<string | null>(null);
  const [shopperName, setShopperName] = useState<string | null>(null);
  const [invalidToken, setInvalidToken] = useState(false);

  const load = useCallback(async () => {
    if (!saleId || !token) {
      setItems([]);
      setShopperId(null);
      setShopperName(null);
      setInvalidToken(false);
      return;
    }
    const { data, error } = await supabasePublic.rpc('my_basket', { p_sale_id: saleId, p_token: token });
    if (error) {
      console.warn('my_basket failed:', error.message);
      return;
    }
    const res = data as MyBasketResponse;
    if (!res?.success) {
      setItems([]);
      setShopperId(null);
      setShopperName(null);
      setInvalidToken(res?.error === 'invalid_token');
      return;
    }
    setInvalidToken(false);
    setShopperId(res.shopper_id ?? null);
    setShopperName(res.name ?? null);
    const now = Date.now();
    setItems(
      (res.items ?? [])
        .filter((l) => new Date(l.held_until).getTime() > now)
        .map((l) => ({
          lotId: l.id,
          lotNumber: l.lot_number,
          name: l.name,
          price: l.starting_bid ?? 0,
          heldUntil: l.held_until,
        })),
    );
  }, [saleId, token]);

  // Any shopper activity (viewing a lot, opening the basket, returning to the
  // app) means they're still shopping, so push every live hold back to a fresh
  // 30 minutes. The server never resurrects an already-expired hold.
  const renewAll = useCallback(
    async (force = false) => {
      if (!saleId || !token) return;
      const now = Date.now();
      const key = `${saleId}:${token}`;
      if (!force && now - (lastRenewAt.get(key) ?? 0) < RENEW_THROTTLE_MS) return;
      lastRenewAt.set(key, now);
      const res = await renewMyBasket(supabasePublic, saleId, token);
      if (res.success) await load();
    },
    [saleId, token, load],
  );

  // On mount / when the basket becomes known: load, then renew (still shopping).
  useEffect(() => {
    load();
    renewAll();
  }, [load, renewAll]);

  // Live: any lot change in this sale may affect this basket → reload.
  useEffect(() => {
    if (!saleId || !token) return;
    return subscribeSaleLots(saleId, () => load());
  }, [saleId, token, load]);

  // Mobile browsers suspend background tabs and drop the realtime socket, so a
  // change made on another device can be missed. Reload whenever this page
  // regains focus/visibility so the basket is fresh when the shopper returns.
  useEffect(() => {
    if (!saleId || !token) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') renewAll().then(() => load());
    };
    const onFocus = () => renewAll().then(() => load());
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [saleId, token, renewAll, load]);

  // Keep holds alive while a page using this basket stays open (every 10 min).
  useEffect(() => {
    if (!saleId || !token) return;
    const t = setInterval(() => renewAll(true), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [saleId, token, renewAll]);

  // hold_lot also resets the rest of this shopper's basket to the same timer.
  const add = useCallback(
    async (lotId: string): Promise<HoldResult> => {
      if (!token) return { success: false, error: 'unknown' };
      const res = await holdLot(supabasePublic, lotId, token);
      if (res.success) await load();
      return res;
    },
    [token, load],
  );

  const remove = useCallback(
    async (lotId: string) => {
      if (!token) return;
      await releaseLot(supabasePublic, lotId, token);
      await load();
    },
    [token, load],
  );

  const has = useCallback((lotId: string) => items.some((i) => i.lotId === lotId), [items]);
  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  return {
    /** Shopper id (the basket key in links and staff screens); '' until known. */
    basketId: shopperId ?? '',
    shopperName,
    invalidToken,
    items,
    add,
    remove,
    has,
    total,
    reload: load,
  };
}
