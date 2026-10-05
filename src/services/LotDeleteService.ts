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
  if (lotErr || !deleted?.length) {
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
}
