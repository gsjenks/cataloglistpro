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

  useEffect(() => {
    load();
  }, [load]);

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

  // Renew holds while a page using this basket is open (every 10 min).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!saleId || !basketId) return;
    let cancelled = false;
    const renew = async () => {
      for (const it of itemsRef.current) {
        await holdLot(supabasePublic, it.lotId, basketId);
        if (cancelled) return;
      }
      if (!cancelled) load();
    };
    const t = setInterval(renew, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [saleId, basketId, load]);

  const add = useCallback(
    async (lotId: string): Promise<HoldResult> => {
      if (!basketId) return { success: false, error: 'unknown' };
      const res = await holdLot(supabasePublic, lotId, basketId);
      if (res.success) await load();
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
