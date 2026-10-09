// src/services/RoomCaptureVideoService.ts
// Narrated walkthrough videos -> a room-capture package for the review screen.
// The clips are uploaded and analysed on the server (RoomCaptureQueue and the
// room-capture edge function); the server cannot cut photos from a video, so
// that happens here when a room is opened for review: each item's crop is cut
// from the sharpest frame near its timestamp, read straight from the stored clip,
// then the server's room-wide merge turns the items into lots.
// See docs/room-capture-spec.md.

import { supabase } from '../lib/supabase';
import type { CaptureLot, CaptureMember, CapturePackage } from './RoomCaptureImportService';
import { clipVideoUrl, type RoomCaptureClip, type RoomCaptureJob } from './RoomCaptureQueue';

export interface ClipItem {
  id: number;
  name: string;
  category?: string;
  description?: string;
  quantity?: number;
  wall?: string;
  timestamp?: string;
  box_2d?: number[];
  group_id?: string | null;
  group_name?: string | null;
  estate_price?: number;
  fixture?: boolean;
  not_for_sale?: boolean;
  not_for_sale_reason?: string | null;
  possibly_restricted?: boolean;
  from_voice?: boolean;
  spoken_facts?: string | string[] | null;
  position?: number | null;       // from the nearest printed position sign
  position_sign?: string | null;  // the sign text as read
}

export interface Crop {
  blob: Blob;
  width: number;
  height: number;
}

export interface ClipResult {
  summary: string;
  transcript: string;
  items: ClipItem[];
  crops: Map<number, Crop>;
}

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('room-capture', { body: { action, ...body } });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) detail = (await ctx.json())?.error || detail;
    } catch {
      /* keep the generic message */
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const tsSeconds = (ts?: string) => {
  if (!ts) return 0;
  const parts = String(ts).split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};

// ---- Frames and crops ----

/** A clip on this device (File) or in storage (signed URL). */
function loadVideo(src: File | string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    // A stored clip comes from another origin; without CORS the frames could
    // not be read back off the canvas.
    if (typeof src === 'string') v.crossOrigin = 'anonymous';
    v.src = typeof src === 'string' ? src : URL.createObjectURL(src);
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('This browser cannot read the video file to cut crops.'));
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done);
      resolve();
    };
    v.addEventListener('seeked', done);
    setTimeout(done, 8000);
    v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 0.05));
  });
}

/** Laplacian variance of a small grayscale copy of the current frame: higher = sharper. */
function sharpness(v: HTMLVideoElement, scratch: HTMLCanvasElement): number {
  const w = 240;
  const h = Math.max(1, Math.round((v.videoHeight / v.videoWidth) * w));
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(v, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

interface Frame {
  full: Blob; // the frame at full resolution, JPEG (a phone can't hold dozens of raw frames)
  small: string; // base64 JPEG, long side 1024, for the refine pass
}

function boxPx(box: number[] | null | undefined, W: number, H: number, pad: number) {
  let [y0, x0, y1, x1] = Array.isArray(box) && box.length === 4 ? box : [0, 0, 1000, 1000];
  if (!(y1 > y0 && x1 > x0)) [y0, x0, y1, x1] = [0, 0, 1000, 1000];
  const px = ((x1 - x0) / 1000) * W * pad;
  const py = ((y1 - y0) / 1000) * H * pad;
  const cx = Math.max(0, (x0 / 1000) * W - px);
  const cy = Math.max(0, (y0 / 1000) * H - py);
  return { cx, cy, cw: Math.min(W, (x1 / 1000) * W + px) - cx, ch: Math.min(H, (y1 / 1000) * H + py) - cy };
}

async function toBase64(c: HTMLCanvasElement, quality: number): Promise<string> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', quality));
  if (!blob) return '';
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function cropItems(
  src: File | string,
  items: ClipItem[],
  onProgress: (fraction: number) => void,
  offsets: number[] = [-0.4, -0.2, 0, 0.2, 0.4],
  refine = true,
): Promise<Map<number, Crop>> {
  const crops = new Map<number, Crop>();
  const frames = new Map<number, Frame>();
  if (!items.length) return crops;
  const v = await loadVideo(src);
  const scratch = document.createElement('canvas');
  const small = document.createElement('canvas');
  const fullCanvas = document.createElement('canvas');
  try {
    // 1. The sharpest frame near each item's timestamp (motion blur was the
    //    biggest problem in walkthrough frames).
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const t = tsSeconds(it.timestamp);
      let best = t;
      let bestScore = -1;
      for (const dt of offsets) {
        await seek(v, t + dt);
        const s = sharpness(v, scratch);
        if (s > bestScore) {
          bestScore = s;
          best = t + dt;
        }
      }
      await seek(v, best);
      fullCanvas.width = v.videoWidth;
      fullCanvas.height = v.videoHeight;
      fullCanvas.getContext('2d')!.drawImage(v, 0, 0, fullCanvas.width, fullCanvas.height);
      const full = await new Promise<Blob | null>((r) => fullCanvas.toBlob(r, 'image/jpeg', 0.92));
      if (!full) continue;
      const scale = Math.min(1, 1024 / Math.max(fullCanvas.width, fullCanvas.height));
      small.width = Math.round(fullCanvas.width * scale);
      small.height = Math.round(fullCanvas.height * scale);
      small.getContext('2d')!.drawImage(fullCanvas, 0, 0, small.width, small.height);
      frames.set(it.id, { full, small: refine ? await toBase64(small, 0.85) : '' });
      onProgress(((k + 1) / items.length) * (refine ? 0.6 : 1));
    }
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(v.src);
    v.removeAttribute('src');
    v.load();
  }

  // 2. Re-find each item on its frame as a still image: far tighter boxes than the
  //    video pass gives. On failure the video boxes are used.
  const boxes = new Map<number, number[]>();
  if (refine) {
    const list = items.filter((it) => frames.get(it.id)?.small);
    // ~3 s per frame on the model; batches of 20 keep each call well inside the
    // function's time limit.
    for (let i = 0; i < list.length; i += 20) {
      const batch = list.slice(i, i + 20);
      try {
        const { result } = await call<{ result: { boxes?: { id: number; box_2d: number[] | null }[] } }>('refine', {
          frames: batch.map((it) => ({ id: it.id, name: it.name, data: frames.get(it.id)!.small })),
        });
        for (const b of result.boxes ?? []) {
          if (b && typeof b.id === 'number' && Array.isArray(b.box_2d) && b.box_2d.length === 4) boxes.set(b.id, b.box_2d);
        }
      } catch (e) {
        console.error('Box refinement failed; using the video boxes:', e);
      }
      onProgress(0.6 + 0.3 * Math.min(1, (i + batch.length) / list.length));
    }
  }

  // 3. Crop from the full-resolution frame.
  for (const it of items) {
    const f = frames.get(it.id);
    if (!f) continue;
    const bitmap = await createImageBitmap(f.full);
    const W = bitmap.width;
    const H = bitmap.height;
    const refined = boxes.get(it.id);
    const { cx, cy, cw, ch } = boxPx(refined ?? it.box_2d, W, H, refined ? 0.06 : 0.08);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cw));
    out.height = Math.max(1, Math.round(ch));
    out.getContext('2d')!.drawImage(bitmap, cx, cy, cw, ch, 0, 0, out.width, out.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/jpeg', 0.9));
    if (blob) crops.set(it.id, { blob, width: out.width, height: out.height });
  }
  onProgress(1);
  return crops;
}

// ---- Lots ----

export interface MergedLot {
  name: string;
  members: string[];
  best?: string;
  quantity?: number;
  price?: number;
  wall?: string;
  position?: number | null;
  not_for_sale?: boolean;
}

/** A sign position the AI reported, if it is a usable 1-20. */
function signPosition(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null;
}

const spoken = (s: ClipItem['spoken_facts']) =>
  (Array.isArray(s) ? s : s ? [s] : []).map(String).filter(Boolean);

/**
 * Turn a room's analysed clips into the package the review screen takes: lots in
 * walking order (clip order, then time), each with its crops. `merged` is the
 * server's room-wide merge (ids V1-3 = clip 1, item 3); without it (one clip, or
 * the merge failed) each item is its own lot, with pairs joined by their group.
 */
export function buildRoomPackage(
  room: string,
  clips: { label: string; result: ClipResult }[],
  roomCode?: string,
  merged?: MergedLot[] | null,
): { pkg: CapturePackage; images: Map<string, File> } {
  const byId = new Map<string, { clip: number; item: ClipItem; crop?: Crop }>();
  for (let c = 0; c < clips.length; c++) {
    for (const it of clips[c].result.items) {
      byId.set(`V${c + 1}-${it.id}`, { clip: c, item: it, crop: clips[c].result.crops.get(it.id) });
    }
  }

  const single = (id: string, item: ClipItem): MergedLot => ({
    name: item.name, members: [id], best: id, quantity: item.quantity ?? 1, price: item.estate_price ?? 0,
    wall: item.wall, position: signPosition(item.position), not_for_sale: item.not_for_sale,
  });

  let lotsIn: MergedLot[];
  if (merged?.length) {
    lotsIn = merged;
  } else {
    // Pairs and sets within one clip share a group_id.
    lotsIn = [];
    const groups = new Map<string, MergedLot>();
    for (const [id, { clip, item }] of byId) {
      if (!item.group_id) {
        lotsIn.push(single(id, item));
        continue;
      }
      const key = `${clip}:${item.group_id}`;
      const g = groups.get(key);
      if (g) {
        g.members.push(id);
        g.quantity = (g.quantity ?? 1) + (item.quantity ?? 1);
        g.price = (g.price ?? 0) + (item.estate_price ?? 0);
        continue;
      }
      const lot = { ...single(id, item), name: item.group_name || item.name };
      groups.set(key, lot);
      lotsIn.push(lot);
    }
  }

  // Rows the merge left out are kept as their own lots rather than silently lost.
  const used = new Set(lotsIn.flatMap((l) => l.members || []));
  for (const [id, { item }] of byId) {
    if (!used.has(id)) lotsIn.push(single(id, item));
  }

  const images = new Map<string, File>();
  const members: Record<string, CaptureMember> = {};
  for (const [id, { item }] of byId) {
    members[id] = {
      name: item.name,
      description: item.description ?? null,
      narration: spoken(item.spoken_facts).join('; ') || null,
      quantity: item.quantity ?? 1,
      price: Math.round(Number(item.estate_price) || 0),
      position: signPosition(item.position),
      not_for_sale: !!item.not_for_sale,
    };
  }

  const lots: (CaptureLot & { _order: [number, number] })[] = [];
  const prices = lotsIn.filter((l) => !l.not_for_sale).map((l) => Number(l.price) || 0).sort((a, b) => b - a);
  const top = prices.length ? prices[Math.max(0, Math.floor(prices.length * 0.15) - 1)] : 0;
  lotsIn.forEach((l, i) => {
    const ms = (l.members || []).filter((m) => byId.has(m));
    if (!ms.length) return;
    const best = l.best && byId.has(l.best) ? l.best : ms[0];
    const bi = byId.get(best)!;
    const photos: string[] = [];
    for (const m of [best, ...ms.filter((x) => x !== best)]) {
      const crop = byId.get(m)!.crop;
      if (!crop) continue;
      const path = `crops/${m}.jpg`;
      images.set(path, new File([crop.blob], `${m}.jpg`, { type: 'image/jpeg' }));
      photos.push(path);
    }
    const said = [...new Set(ms.flatMap((m) => spoken(byId.get(m)!.item.spoken_facts)))];
    const restricted = ms.some((m) => byId.get(m)!.item.possibly_restricted);
    const price = Math.round(Number(l.price) || 0);
    const bestCrop = bi.crop;
    const small = !bestCrop || Math.min(bestCrop.width, bestCrop.height) < 400;
    const order = ms
      .map((m) => [byId.get(m)!.clip, tsSeconds(byId.get(m)!.item.timestamp)] as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
    lots.push({
      key: `L${i + 1}`,
      name: l.name || bi.item.name,
      description: bi.item.description ?? null,
      narration: said.join('; ') || null,
      category: bi.item.category ?? null,
      quantity: Math.max(1, Math.round(Number(l.quantity) || 1)),
      price,
      location: l.wall || bi.item.wall || null,
      // The merge's pick, else the first member that read a sign.
      position: signPosition(l.position)
        ?? ms.map((m) => signPosition(byId.get(m)!.item.position)).find((p) => p != null)
        ?? null,
      not_for_sale: !!l.not_for_sale,
      possibly_restricted: restricted,
      needs_detail: !l.not_for_sale && (price >= top || restricted || small),
      members: ms,
      photos,
      _order: order,
    });
  });
  lots.sort((a, b) => a._order[0] - b._order[0] || a._order[1] - b._order[1]);

  const pkg: CapturePackage = {
    format: 'room-capture',
    version: 1,
    source: `${clips.length} walkthrough clip${clips.length > 1 ? 's' : ''}, analysed on the server`,
    captured: new Date().toISOString().slice(0, 10),
    room: roomCode ? { name: room, code: roomCode } : { name: room },
    lots: lots.map(({ _order, ...l }) => l),
    members,
  };
  return { pkg, images };
}

/**
 * A room the server has finished: cut every item's crop from its stored clip
 * (onProgress: overall 0-1 and a line for the screen), then build the package.
 */
export async function prepareJobPackage(
  job: RoomCaptureJob,
  clips: RoomCaptureClip[],
  onProgress: (fraction: number, label: string) => void,
): Promise<{ pkg: CapturePackage; images: Map<string, File> }> {
  const done = clips.filter((c) => c.status === 'done' && c.result);
  const order = job.merged?.clipIds?.length ? job.merged.clipIds : done.map((c) => c.id);
  const ordered = order.map((id) => done.find((c) => c.id === id)).filter((c): c is RoomCaptureClip => !!c);
  const results: { label: string; result: ClipResult }[] = [];
  for (let k = 0; k < ordered.length; k++) {
    const c = ordered[k];
    const items = ((c.result?.items ?? []) as ClipItem[]).filter((i) => i && typeof i.id === 'number');
    const label = `Cutting photos: clip ${k + 1} of ${ordered.length}`;
    onProgress(k / ordered.length, label);
    let crops = new Map<number, Crop>();
    try {
      const url = await clipVideoUrl(c.storage_path);
      crops = await cropItems(url, items, (f) => onProgress((k + f) / ordered.length, label));
    } catch (e) {
      // The lots still come through; they just have no crop yet.
      console.error(`[ROOM CAPTURE] crops for ${c.file_name}:`, e);
    }
    results.push({
      label: c.file_name,
      result: { summary: c.result?.summary ?? '', transcript: c.result?.transcript ?? '', items, crops },
    });
  }
  onProgress(1, 'Building the lot list');
  return buildRoomPackage(
    job.room_name || 'Room',
    results,
    job.room_code ?? undefined,
    (job.merged?.lots as MergedLot[] | null) ?? null,
  );
}
