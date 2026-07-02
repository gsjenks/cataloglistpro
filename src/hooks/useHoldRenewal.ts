// src/hooks/useHoldRenewal.ts
// Renews all basket holds while a buyer page is open (on mount + every 10 min),
// so items don't expire mid-shop. Items lost to another buyer/sold are dropped.
// Shared by the public lot page and the dedicated basket page.

import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { holdLot } from '../lib/holds';
import type { BasketItem } from './useBuyerBasket';

interface RenewableBasket {
  basketId: string;
  items: BasketItem[];
  updateHeldUntil: (lotId: string, heldUntil: string) => void;
  removeItem: (lotId: string) => void;
}

export function useHoldRenewal(
  client: SupabaseClient,
  enabled: boolean,
  basket: RenewableBasket,
) {
  const itemsRef = useRef(basket.items);
  itemsRef.current = basket.items;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const renew = async () => {
      for (const item of itemsRef.current) {
        const res = await holdLot(client, item.lotId, basket.basketId);
        if (cancelled) return;
        if (res.success && res.heldUntil) {
          basket.updateHeldUntil(item.lotId, res.heldUntil);
        } else if (res.error === 'sold' || res.error === 'held_by_other') {
          basket.removeItem(item.lotId);
        }
      }
    };
    renew();
    const t = setInterval(renew, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, basket.basketId, client]);
}
