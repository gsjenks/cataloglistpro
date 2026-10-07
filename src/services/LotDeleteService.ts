// src/services/LotDeleteService.ts
// Deleting a lot on the server. photos.lot_id has no ON DELETE CASCADE, so a lot
// with photo rows can't be deleted until they are; the delete paths only removed
// the photo FILES, so the lot delete failed (silently on the lot screen) and the
// files were already gone. Here the photo rows go first, the lot delete is
// checked to have removed a row, the rows are restored if it didn't, and the
// files are removed only once the lot is really gone.
// sales_transaction_items and refunds reference lots ON DELETE SET NULL.

import { supabase } from '../lib/supabase';
import offlineStorage from './Offlinestorage';
import type { Photo } from '../types';

export async function deleteLotOnServer(lotId: string): Promise<void> {
  const { data: photos, error: readErr } = await supabase.from('photos').select('*').eq('lot_id', lotId);
  if (readErr) throw new Error(`Could not read the item's photos: ${readErr.message}`);
  const rows = (photos || []) as Photo[];

  if (rows.length) {
    const { data: gone, error } = await supabase.from('photos').delete().eq('lot_id', lotId).select('id');
    if (error) throw new Error(`Could not remove the item's photos: ${error.message}`);
    if (!gone?.length) throw new Error("You don't have permission to delete this item's photos.");
  }

  const { data: deleted, error: lotErr } = await supabase.from('lots').delete().eq('id', lotId).select('id');
  // Nothing deleted can mean the lot is already gone from the server (deleted
  // earlier, or on another device) while this device still holds a copy. That
  // copy is what keeps showing, so finish the delete here instead of refusing.
  const alreadyGone = !lotErr && !deleted?.length && !rows.length && !(await lotExistsOnServer(lotId));
  if (!alreadyGone && (lotErr || !deleted?.length)) {
    // Put the photo rows back so a failed delete doesn't leave the item without photos.
    if (rows.length) {
      const { error } = await supabase.from('photos').insert(rows);
      if (error) console.error('Could not restore photo rows after a failed lot delete:', error.message);
    }
    if (lotErr) {
      throw new Error(
        lotErr.code === '23503'
          ? 'Other records still point at this item, so it cannot be deleted.'
          : `Could not delete the item: ${lotErr.message}`,
      );
    }
    throw new Error("You don't have permission to delete this item (nothing was deleted).");
  }

  if (rows.length) {
    const { error } = await supabase.storage.from('photos').remove(rows.map((p) => p.file_path));
    if (error) console.error('Lot deleted, but its photo files were not removed:', error.message);
  }
  const local = await offlineStorage.getPhotosByLot(lotId).catch(() => [] as Photo[]);
  for (const p of [...rows, ...local]) {
    await offlineStorage.deletePhoto(p.id).catch(() => undefined);
  }
  await forgetLotLocally(lotId);
}

async function lotExistsOnServer(lotId: string): Promise<boolean> {
  const { data, error } = await supabase.from('lots').select('id').eq('id', lotId).maybeSingle();
  if (error) throw new Error(`Could not check the item: ${error.message}`);
  return !!data;
}

// The device's copy has to go too. The Items tab lists local lots the server
// doesn't have (so offline work doesn't vanish), and the sync re-uploads them —
// so a lot deleted only on the server came straight back. Mark it deleted and
// retire any queued create/update for it (the queue is keyed by lot id).
export async function forgetLotLocally(lotId: string): Promise<void> {
  try {
    const lot = await offlineStorage.getLot(lotId);
    if (lot) await offlineStorage.upsertLot({ ...lot, deleted: true } as typeof lot & { deleted: boolean });
    await offlineStorage.markSynced(lotId);
  } catch (e) {
    console.error('Lot deleted, but its offline copy was not cleared:', e);
  }
}
