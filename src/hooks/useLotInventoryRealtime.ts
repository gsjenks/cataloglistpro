// src/hooks/useLotInventoryRealtime.ts
// Live inventory sync for the estate-sale floor. Subscribes to changes on the
// `lots` table for one sale so every staff device sees available/held/sold
// updates in real time. Mirrors the realtime pattern in hooks/useAuction.ts.
//
// Requires the `lots` table to be in the `supabase_realtime` publication
// (see supabase/migrations/20260702000001_estate_sale_phase1_realtime.sql).

import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Lot } from '../types';

interface Options {
  // Called with the new row when an existing lot is updated (e.g. status change).
  onUpdate: (lot: Lot) => void;
  // Called when a lot is inserted or deleted — the caller should reload the list.
  onStructuralChange: () => void;
  // When false, the subscription is skipped (e.g. auction sales).
  enabled?: boolean;
}

export function useLotInventoryRealtime(
  saleId: string | undefined,
  { onUpdate, onStructuralChange, enabled = true }: Options,
) {
  useEffect(() => {
    if (!saleId || !enabled) return;

    const channel = supabase
      .channel(`estate-inventory:${saleId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lots', filter: `sale_id=eq.${saleId}` },
        (payload) => onUpdate(payload.new as Lot),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lots', filter: `sale_id=eq.${saleId}` },
        () => onStructuralChange(),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'lots', filter: `sale_id=eq.${saleId}` },
        () => onStructuralChange(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [saleId, enabled, onUpdate, onStructuralChange]);
}
