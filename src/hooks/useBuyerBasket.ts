// src/hooks/useBuyerBasket.ts
// Buyer's basket for estate-sale self-checkout. Lives entirely in the browser
// (buyers aren't logged in): a per-browser basket id plus per-sale item lists in
// localStorage. Expired holds are pruned on load.

import { useCallback, useEffect, useState } from 'react';

export interface BasketItem {
  lotId: string;
  lotNumber: number | string | null;
  name: string;
  price: number;
  heldUntil: string; // ISO
}

const BASKET_ID_KEY = 'buyer_basket_id';
const itemsKey = (saleId: string) => `buyer_basket_${saleId}`;

function getOrCreateBasketId(): string {
  let id = localStorage.getItem(BASKET_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `b_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(BASKET_ID_KEY, id);
  }
  return id;
}

function loadItems(saleId: string): BasketItem[] {
  try {
    const raw = localStorage.getItem(itemsKey(saleId));
    if (!raw) return [];
    const items = JSON.parse(raw) as BasketItem[];
    // Drop expired holds
    const now = Date.now();
    return items.filter((i) => new Date(i.heldUntil).getTime() > now);
  } catch {
    return [];
  }
}

export function useBuyerBasket(saleId: string | undefined) {
  const [basketId] = useState<string>(() => getOrCreateBasketId());
  const [items, setItems] = useState<BasketItem[]>(() => (saleId ? loadItems(saleId) : []));

  const persist = useCallback(
    (next: BasketItem[]) => {
      if (!saleId) return;
      localStorage.setItem(itemsKey(saleId), JSON.stringify(next));
      setItems(next);
    },
    [saleId],
  );

  // Reload if the sale changes, and prune expired items once a minute.
  useEffect(() => {
    if (!saleId) return;
    setItems(loadItems(saleId));
    const t = setInterval(() => setItems(loadItems(saleId)), 60_000);
    return () => clearInterval(t);
  }, [saleId]);

  const addItem = useCallback(
    (item: BasketItem) => {
      const next = [...items.filter((i) => i.lotId !== item.lotId), item];
      persist(next);
    },
    [items, persist],
  );

  const removeItem = useCallback(
    (lotId: string) => {
      persist(items.filter((i) => i.lotId !== lotId));
    },
    [items, persist],
  );

  // Extend an item's hold (called by the page's renewal loop while shopping).
  const updateHeldUntil = useCallback(
    (lotId: string, heldUntil: string) => {
      if (!saleId) return;
      setItems((prev) => {
        const next = prev.map((i) => (i.lotId === lotId ? { ...i, heldUntil } : i));
        localStorage.setItem(itemsKey(saleId), JSON.stringify(next));
        return next;
      });
    },
    [saleId],
  );

  const has = useCallback((lotId: string) => items.some((i) => i.lotId === lotId), [items]);

  const total = items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

  return { basketId, items, addItem, removeItem, updateHeldUntil, has, total };
}
