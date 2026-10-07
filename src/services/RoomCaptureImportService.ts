// src/services/RoomCaptureImportService.ts
// Room capture import: turns a room-capture package (lots.json plus the crop images
// the capture/AI step produced) into lots in a sale, each with its crops as photos.
// See docs/room-capture-spec.md. Crops are saved with a `roomcapture_` file name so
// lots still waiting for real photos can be told apart later.

import { supabase } from '../lib/supabase';
import { generateQRCodeForLot } from '../lib/qr';
import offlineStorage from './Offlinestorage';
import CameraService from './CameraService';
import ConnectivityService from './ConnectivityService';
import { getNextLotNumber } from './LotNumberService';
import type { Lot } from '../types';
import { isRoomCode } from '../lib/roomCodes';
import { ensureSaleRoom } from './SaleRoomService';
import { formatZone } from '../lib/roomCodes';

export const CROP_FILE_PREFIX = 'roomcapture_';

export interface CaptureLot {
  key: string;
  name: string;
  description?: string | null;
  narration?: string | null;
  category?: string | null;
  quantity: number;
  price: number;
  location?: string | null;
  /** Position 1-20 read from the printed sign near the item; with the room code -> zone MR01-02. */
  position?: number | null;
  not_for_sale: boolean;
  possibly_restricted: boolean;
  needs_detail: boolean;
  members: string[];
  photos: string[];
}

export interface CapturePackage {
  format: 'room-capture';
  version: number;
  source?: string;
  captured?: string;
  room?: { code?: string; name?: string };
  lots: CaptureLot[];
}

export interface LoadedPackage {
  pkg: CapturePackage;
  images: Map<string, File>;
}

/** Everything after the package folder, e.g. "office-room-capture/crops/V1-3.jpg" -> "crops/V1-3.jpg". */
function packagePath(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  const parts = rel.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : file.name;
}

const baseName = (p: string) => p.split('/').pop() || p;

/** Read a package from a picked folder, or from lots.json plus its images picked together. */
export async function readCapturePackage(files: File[]): Promise<LoadedPackage> {
  const json = files.find((f) => f.name.toLowerCase() === 'lots.json');
  if (!json) throw new Error('No lots.json found. Pick the capture folder, or lots.json together with its images.');
  let pkg: CapturePackage;
  try {
    pkg = JSON.parse(await json.text());
  } catch {
    throw new Error('lots.json is not valid JSON.');
  }
  if (pkg?.format !== 'room-capture' || !Array.isArray(pkg.lots)) {
    throw new Error('lots.json is not a room-capture package.');
  }
  const images = new Map<string, File>();
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    images.set(packagePath(f), f);
    if (!images.has(baseName(f.name))) images.set(baseName(f.name), f);
  }
  return { pkg, images };
}

export function findImage(images: Map<string, File>, path: string): File | undefined {
  return images.get(path) || images.get(baseName(path));
}

export function lotDescription(l: CaptureLot, roomName?: string): string {
  const lines: string[] = [];
  if (l.description) lines.push(l.description);
  if (l.narration) lines.push(`Narration: ${l.narration}`);
  const where = [roomName, l.location].filter(Boolean).join(' — ');
  if (where) lines.push(`Location: ${where}`);
  return lines.join('\n\n');
}

export interface ImportProgress {
  done: number;
  total: number;
  stage: string;
}

export interface ImportResult {
  created: number;
  photos: number;
  missingPhotos: number;
  firstNumber: number;
  lastNumber: number;
}

async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/**
 * Create one lot per capture lot, in the order given (walking order), numbered after
 * the sale's highest lot number, then attach each lot's crops (first = primary).
 * Online only: lot numbers must be real, and the crops have to upload.
 */
export async function importCaptureLots(opts: {
  saleId: string;
  lots: CaptureLot[];
  images: Map<string, File>;
  consignmentId: string | null;
  roomName?: string;
  /** The package room code (OF01); set on every lot and added to the sale room list. */
  roomCode?: string;
  onProgress?: (p: ImportProgress) => void;
}): Promise<ImportResult> {
  const { saleId, lots, images, consignmentId, roomName, onProgress } = opts;
  const roomCode = opts.roomCode?.toUpperCase();
  const room = roomCode && isRoomCode(roomCode) ? roomCode : null;
  if (!ConnectivityService.getConnectionStatus()) {
    throw new Error('Importing needs a connection. Try again when you are back online.');
  }
  if (lots.length === 0) throw new Error('Nothing selected to import.');

  if (room) {
    // Best effort: the lots still carry the room code if this fails.
    await ensureSaleRoom(saleId, room, roomName).catch((e) => console.warn('Could not add the room to the sale:', e));
  }

  const first = await getNextLotNumber(saleId, true);
  if (!first || first < 1) throw new Error('Could not get the next lot number for this sale.');

  const now = new Date().toISOString();
  const rows: Lot[] = lots.map((l, i) => ({
    id: crypto.randomUUID(),
    sale_id: saleId,
    lot_number: first + i,
    name: l.name.trim() || 'Untitled item',
    description: lotDescription(l, roomName),
    quantity: Math.max(1, Math.round(l.quantity || 1)),
    category: l.category || undefined,
    starting_bid: l.price > 0 ? Math.round(l.price) : undefined,
    inventory_status: 'available',
    is_restricted: l.possibly_restricted,
    restricted_category: l.possibly_restricted ? 'Possible restricted material (verify)' : undefined,
    consignment_id: consignmentId || undefined,
    room,
    zone: room ? formatZone(room, l.position) ?? undefined : undefined,
    needs_detail: !!l.needs_detail,
    created_at: now,
    updated_at: now,
  }));

  onProgress?.({ done: 0, total: lots.length, stage: 'Creating lots' });
  // One insert so the batch lands whole or not at all.
  const { error } = await supabase.from('lots').insert(rows);
  if (error) throw new Error(`Could not create the lots: ${error.message}`);
  for (const r of rows) {
    await offlineStorage.upsertLot(r).catch((e) => console.error('Local mirror failed:', e));
  }

  let photos = 0;
  let missingPhotos = 0;
  let done = 0;
  onProgress?.({ done, total: lots.length, stage: 'Adding photos' });
  await pool(lots, 3, async (l, i) => {
    const lot = rows[i];
    for (let j = 0; j < l.photos.length; j++) {
      const file = findImage(images, l.photos[j]);
      if (!file) {
        missingPhotos++;
        continue;
      }
      const member = baseName(l.photos[j]).replace(/\.[^.]+$/, '');
      try {
        await CameraService.addPhotoBlob(lot.id, file, j === 0, `${CROP_FILE_PREFIX}${member}.jpg`);
        photos++;
      } catch (e) {
        console.error(`Photo ${l.photos[j]} for lot ${lot.lot_number} failed:`, e);
        missingPhotos++;
      }
    }
    await generateQRCodeForLot(saleId, lot.id, Number(lot.lot_number)).catch((e) =>
      console.error('QR generation failed:', e),
    );
    done++;
    onProgress?.({ done, total: lots.length, stage: 'Adding photos' });
  });

  return {
    created: rows.length,
    photos,
    missingPhotos,
    firstNumber: first,
    lastNumber: first + rows.length - 1,
  };
}
