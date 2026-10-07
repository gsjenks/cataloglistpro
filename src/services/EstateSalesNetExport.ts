// src/services/EstateSalesNetExport.ts
// Photos for an EstateSales.net listing: one ZIP with each lot's PRIMARY photo,
// in walking order (room list order, then position, then lot number), named
// "001 - Lot 12 - Walnut highboy.jpg" so they upload in the order buyers walk
// the house, plus captions.csv (order, lot, item, price, room, location, file)
// to copy captions from. Big phone photos are shrunk to 2048 px on the long
// edge. EstateSales.net takes photo uploads, not a catalog file.

import JSZip from 'jszip';
import { supabase } from '../lib/supabase';
import type { Lot } from '../types';
import PhotoService, { isImageBlob } from './PhotoService';
import { listSaleRooms } from './SaleRoomService';
import { compareByLocation } from '../lib/roomCodes';
import { CROP_FILE_PREFIX } from './RoomCaptureImportService';

const MAX_EDGE = 2048;

interface PhotoRow {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string | null;
  is_primary: boolean | null;
  created_at: string | null;
}

export interface PhotoExportResult {
  added: number;
  cropsIncluded: number;
  cropsSkipped: number;
  noPhoto: (number | string)[];   // lot numbers with no photo at all
  failed: (number | string)[];    // lot numbers whose photo could not be fetched
  fileName: string;
}

export interface PhotoExportProgress {
  done: number;
  total: number;
}

function safe(text: string, max = 60): string {
  return text.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The primary photo, else the oldest. */
function pickPrimary(photos: PhotoRow[]): PhotoRow | undefined {
  return [...photos].sort((a, b) => {
    if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  })[0];
}

function isCrop(p: PhotoRow): boolean {
  return (p.file_name ?? '').startsWith(CROP_FILE_PREFIX) || p.file_path.includes(`/${CROP_FILE_PREFIX}`);
}

/** The device cache first; else the public photos bucket. Never an error body. */
async function loadBlob(p: PhotoRow): Promise<Blob | null> {
  const cached = await PhotoService.getPhotoBlob(p.id).catch(() => undefined);
  if (isImageBlob(cached)) return cached;
  const url = supabase.storage.from('photos').getPublicUrl(p.file_path).data.publicUrl;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const blob = await res.blob();
  return isImageBlob(blob) ? blob : null;
}

/** Shrink to MAX_EDGE on the long edge as JPEG, honouring EXIF rotation. */
async function shrink(blob: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && blob.type === 'image/jpeg') { bmp.close(); return blob; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', 0.85));
  } catch {
    return blob;
  }
}

async function fetchPhotos(lotIds: string[]): Promise<PhotoRow[]> {
  const rows: PhotoRow[] = [];
  for (let i = 0; i < lotIds.length; i += 150) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, lot_id, file_path, file_name, is_primary, created_at')
      .in('lot_id', lotIds.slice(i, i + 150));
    if (error) throw new Error(`Could not read the photos: ${error.message}`);
    rows.push(...((data as PhotoRow[]) ?? []));
  }
  return rows;
}

export async function exportEstateSalesNetPhotos(opts: {
  saleId: string;
  saleName: string;
  lots: Lot[];
  skipCrops: boolean;
  onProgress?: (p: PhotoExportProgress) => void;
}): Promise<PhotoExportResult> {
  const { saleId, saleName, skipCrops, onProgress } = opts;

  const rooms = await listSaleRooms(saleId).catch(() => []);
  const lots = [...opts.lots].sort(compareByLocation(rooms.map((r) => r.room_code)));
  const byLot = new Map<string, PhotoRow[]>();
  for (const p of await fetchPhotos(lots.map((l) => l.id))) {
    byLot.set(p.lot_id, [...(byLot.get(p.lot_id) ?? []), p]);
  }

  const zip = new JSZip();
  const csv: string[] = ['Order,Lot,Item,Price,Room,Location,File'];
  const roomName = new Map(rooms.map((r) => [r.room_code, r.name]));
  const result: PhotoExportResult = { added: 0, cropsIncluded: 0, cropsSkipped: 0, noPhoto: [], failed: [], fileName: '' };

  // Decide each lot's photo first, so the order numbers have no gaps.
  const plan: { lot: Lot; photo: PhotoRow; order: number; file: string }[] = [];
  for (const lot of lots) {
    const photo = pickPrimary(byLot.get(lot.id) ?? []);
    if (!photo) { result.noPhoto.push(lot.lot_number ?? '—'); continue; }
    if (isCrop(photo) && skipCrops) { result.cropsSkipped++; continue; }
    const order = plan.length + 1;
    const file = `${String(order).padStart(3, '0')} - Lot ${lot.lot_number ?? ''} - ${safe(lot.name || 'Item')}.jpg`;
    plan.push({ lot, photo, order, file });
  }

  let done = 0;
  onProgress?.({ done, total: plan.length });
  // A few at a time: fast on a good connection, gentle on a phone.
  const queue = [...plan];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const blob = await loadBlob(job.photo);
      if (blob) {
        zip.file(job.file, await shrink(blob));
        result.added++;
        if (isCrop(job.photo)) result.cropsIncluded++;
      } else {
        result.failed.push(job.lot.lot_number ?? '—');
      }
      onProgress?.({ done: ++done, total: plan.length });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  for (const { lot, order, file } of plan) {
    csv.push([
      order, lot.lot_number ?? '', lot.name ?? '', lot.starting_bid ?? '',
      lot.room ? `${lot.room} ${roomName.get(lot.room) ?? ''}`.trim() : '', lot.zone ?? '', file,
    ].map(csvCell).join(','));
  }
  zip.file('captions.csv', csv.join('\r\n'));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  result.fileName = `${safe(saleName, 40) || 'Sale'} - EstateSales.net photos.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return result;
}
