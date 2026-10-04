// src/hooks/useLotNeighbors.ts
// Previous / next lot for walking a sale lot by lot from the lot screen, in lot-number
// order. In "photos" walk mode only lots still needing photos count: no photos at
// all, or only room-capture crops (file names starting with CROP_FILE_PREFIX).
// Re-read on every lot change, so a lot that just got a real photo drops out.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import offlineStorage from '../services/Offlinestorage';
import ConnectivityService from '../services/ConnectivityService';
import { CROP_FILE_PREFIX } from '../services/RoomCaptureImportService';

export type WalkMode = 'all' | 'photos';

interface LotRef {
  id: string;
  lot_number: number;
}

export interface LotNeighbors {
  prevId: string | null;
  nextId: string | null;
  position: number; // 1-based among the lots in the current walk; 0 if not in it
  count: number;
  ready: boolean;
}

const needsPhotos = (names: string[] | undefined) =>
  !names || names.length === 0 || names.every((n) => (n || '').startsWith(CROP_FILE_PREFIX));

async function loadLots(saleId: string): Promise<LotRef[]> {
  if (ConnectivityService.getConnectionStatus()) {
    const { data, error } = await supabase
      .from('lots')
      .select('id, lot_number')
      .eq('sale_id', saleId)
      .order('lot_number', { ascending: true });
    if (!error && data) return data as LotRef[];
  }
  const local = await offlineStorage.getLotsBySale(saleId);
  return local
    .filter((l) => !(l as { deleted?: boolean }).deleted)
    .map((l) => ({ id: l.id, lot_number: Number(l.lot_number) || 0 }))
    .sort((a, b) => a.lot_number - b.lot_number);
}

async function loadPhotoNames(lotIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const add = (lotId: string, name: string) => {
    const list = map.get(lotId) || [];
    list.push(name);
    map.set(lotId, list);
  };
  if (ConnectivityService.getConnectionStatus()) {
    let ok = true;
    for (let i = 0; i < lotIds.length; i += 200) {
      const { data, error } = await supabase
        .from('photos')
        .select('lot_id, file_name')
        .in('lot_id', lotIds.slice(i, i + 200));
      if (error || !data) {
        ok = false;
        break;
      }
      data.forEach((p: { lot_id: string; file_name: string }) => add(p.lot_id, p.file_name));
    }
    if (ok) {
      // Photos taken on this device and not uploaded yet count too.
      const local = await offlineStorage.getAllPhotos().catch(() => []);
      const ids = new Set(lotIds);
      local.forEach((p) => {
        if (ids.has(p.lot_id) && !(map.get(p.lot_id) || []).includes(p.file_name)) add(p.lot_id, p.file_name);
      });
      return map;
    }
    map.clear();
  }
  const local = await offlineStorage.getAllPhotos();
  const ids = new Set(lotIds);
  local.forEach((p) => {
    if (ids.has(p.lot_id)) add(p.lot_id, p.file_name);
  });
  return map;
}

export function useLotNeighbors(saleId: string | undefined, lotId: string | undefined, mode: WalkMode): LotNeighbors {
  const [state, setState] = useState<LotNeighbors>({ prevId: null, nextId: null, position: 0, count: 0, ready: false });

  useEffect(() => {
    if (!saleId || !lotId || lotId === 'new') return;
    let cancelled = false;
    (async () => {
      try {
        const lots = await loadLots(saleId);
        let walk = lots;
        if (mode === 'photos') {
          const names = await loadPhotoNames(lots.map((l) => l.id));
          // The current lot stays in the walk so prev/next are relative to it.
          walk = lots.filter((l) => l.id === lotId || needsPhotos(names.get(l.id)));
        }
        const i = walk.findIndex((l) => l.id === lotId);
        let prevId: string | null = null;
        let nextId: string | null = null;
        if (i >= 0) {
          prevId = walk[i - 1]?.id ?? null;
          nextId = walk[i + 1]?.id ?? null;
        } else {
          // Current lot isn't in the list (shouldn't happen): fall back on lot number.
          const cur = lots.find((l) => l.id === lotId);
          if (cur) {
            prevId = [...walk].reverse().find((l) => l.lot_number < cur.lot_number)?.id ?? null;
            nextId = walk.find((l) => l.lot_number > cur.lot_number)?.id ?? null;
          }
        }
        if (!cancelled) {
          setState({ prevId, nextId, position: i >= 0 ? i + 1 : 0, count: walk.length, ready: true });
        }
      } catch (e) {
        console.error('Could not load neighbouring lots:', e);
        if (!cancelled) setState((s) => ({ ...s, ready: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId, lotId, mode]);

  return state;
}
