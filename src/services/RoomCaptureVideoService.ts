// src/services/RoomCaptureVideoService.ts
// Narrated walkthrough videos -> a room-capture package for the review screen.
// Per clip: upload straight to Gemini (resumable, 8 MiB chunks; the session URL
// comes from the room-capture function so the key stays server-side), wait for it
// to process, analyse it (transcript + items with timestamp and box), then cut each
// item's crop from the sharpest local frame near its timestamp. Then one room-wide
// pass merges the clips into lots. See docs/room-capture-spec.md.

import { supabase } from '../lib/supabase';
import type { CaptureLot, CapturePackage } from './RoomCaptureImportService';

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

export type ClipStage = 'uploading' | 'processing' | 'analyzing' | 'cropping';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Upload a clip to Gemini. Returns the Gemini file name. */
async function uploadClip(file: File, onProgress: (fraction: number) => void): Promise<string> {
  // Unique, so the file can be found again if the final response can't be read.
  const displayName = `room-capture-${crypto.randomUUID()}`;
  const { uploadUrl, chunkSize } = await call<{ uploadUrl: string; chunkSize: number }>('start_upload', {
    size: file.size,
    mimeType: file.type || 'video/mp4',
    fileName: file.name,
    displayName,
  });
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(file.size, offset + chunkSize);
    const last = end === file.size;
    let res: Response | null = null;
    if (last) {
      // Google's reply to the final chunk carries no CORS headers, so the browser
      // reports a network error even though the upload completed. Send it, then
      // find the file by its display name instead of reading the reply.
      try {
        res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'X-Goog-Upload-Offset': String(offset), 'X-Goog-Upload-Command': 'upload, finalize' },
          body: file.slice(offset, end),
        });
        if (res.ok) {
          const name = (await res.json().catch(() => null))?.file?.name;
          if (name) {
            onProgress(1);
            return name;
          }
        }
      } catch {
        /* expected: unreadable reply */
      }
      for (let i = 0; i < 10; i++) {
        const found = await call<{ name: string | null }>('find_file', { displayName });
        if (found.name) {
          onProgress(1);
          return found.name;
        }
        await sleep(2000);
      }
      throw new Error('The upload did not complete. Check the connection and try again.');
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Offset': String(offset),
            'X-Goog-Upload-Command': 'upload',
          },
          body: file.slice(offset, end),
        });
        if (res.ok) break;
      } catch (e) {
        if (attempt === 3) throw new Error(`Upload interrupted (${e instanceof Error ? e.message : e}). Check the connection and try again.`);
      }
      await sleep(1500 * attempt);
    }
    if (!res || !res.ok) {
      throw new Error(`Upload failed (${res?.status ?? 'no response'}): ${(await res?.text().catch(() => ''))?.slice(0, 160) ?? ''}`);
    }
    offset = end;
    onProgress(offset / file.size);
  }
  throw new Error('Empty video.');
}

async function waitActive(name: string): Promise<{ uri: string; mimeType: string }> {
  const started = Date.now();
  while (Date.now() - started < 15 * 60 * 1000) {
    const s = await call<{ state: string; uri: string; mimeType: string }>('file_status', { name });
    if (s.state === 'ACTIVE') return { uri: s.uri, mimeType: s.mimeType };
    if (s.state === 'FAILED') throw new Error('Gemini could not process this video.');
    await sleep(4000);
  }
  throw new Error('Gemini took too long to process this video.');
}

export const tsSeconds = (ts?: string) => {
  if (!ts) return 0;
  const parts = String(ts).split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};

// ---- Frames and crops, from the clip on this device ----

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = URL.createObjectURL(file);
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
    setTimeout(done, 4000);
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
  file: File,
  items: ClipItem[],
  onProgress: (fraction: number) => void,
  offsets: number[] = [-0.4, -0.2, 0, 0.2, 0.4],
  refine = true,
): Promise<Map<number, Crop>> {
  const crops = new Map<number, Crop>();
  const frames = new Map<number, Frame>();
  const v = await loadVideo(file);
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
    URL.revokeObjectURL(v.src);
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

/** Upload, analyse and crop one clip. */
export async function processClip(
  file: File,
  room: string,
  saleContext: string,
  onStage: (stage: ClipStage, fraction?: number) => void,
): Promise<ClipResult> {
  onStage('uploading', 0);
  const name = await uploadClip(file, (f) => onStage('uploading', f));
  try {
    onStage('processing');
    const { uri, mimeType } = await waitActive(name);
    onStage('analyzing');
    const { result } = await call<{ result: { clip_summary?: string; transcript?: unknown; items?: ClipItem[] } }>('analyze', {
      uri,
      mimeType,
      room,
      saleContext,
    });
    const items = (Array.isArray(result.items) ? result.items : []).filter((i) => i && typeof i.id === 'number');
    const tx = Array.isArray(result.transcript)
      ? (result.transcript as { t?: string; text?: string }[]).map((s) => s.text || '').join(' ')
      : String(result.transcript || '');
    onStage('cropping', 0);
    const crops = await cropItems(file, items, (f) => onStage('cropping', f));
    return { summary: result.clip_summary || '', transcript: tx.trim(), items, crops };
  } finally {
    call('delete_file', { name }).catch(() => undefined);
  }
}

async function thumbBase64(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 384 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const small = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.8));
  if (!small) return '';
  const buf = new Uint8Array(await small.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

interface MergedLot {
  name: string;
  members: string[];
  best?: string;
  quantity?: number;
  price?: number;
  wall?: string;
  not_for_sale?: boolean;
}

const spoken = (s: ClipItem['spoken_facts']) =>
  (Array.isArray(s) ? s : s ? [s] : []).map(String).filter(Boolean);

/**
 * Merge every clip of the room into lots and build the package the review screen
 * takes: lots in walking order (clip order, then time), each with its crops.
 */
export async function buildRoomPackage(
  room: string,
  clips: { label: string; result: ClipResult }[],
  roomCode?: string,
): Promise<{ pkg: CapturePackage; images: Map<string, File> }> {
  const byId = new Map<string, { clip: number; item: ClipItem; crop?: Crop }>();
  const listing: string[] = [];
  const thumbs: { id: string; data: string }[] = [];
  for (let c = 0; c < clips.length; c++) {
    const { label, result } = clips[c];
    listing.push(`\n== Clip V${c + 1} (${label}) narration: ${result.transcript}\nItems:`);
    for (const it of result.items) {
      const id = `V${c + 1}-${it.id}`;
      const crop = result.crops.get(it.id);
      byId.set(id, { clip: c, item: it, crop });
      listing.push(
        `${id}: ${it.name} | ${it.description ?? ''} | wall: ${it.wall ?? ''} | group: ${it.group_name ?? ''} | said: ${spoken(it.spoken_facts).join('; ')} | $${it.estate_price ?? 0} | qty ${it.quantity ?? 1}${it.not_for_sale ? ' | NFS' : ''}`,
      );
      if (crop) {
        const data = await thumbBase64(crop.blob);
        if (data) thumbs.push({ id, data });
      }
    }
  }

  let merged: MergedLot[];
  if (clips.length === 1) {
    // One clip: nothing to merge across clips; pairs are joined by their group.
    merged = [];
    const groups = new Map<string, MergedLot>();
    for (const [id, { item }] of byId) {
      if (item.group_id) {
        const g = groups.get(item.group_id);
        if (g) {
          g.members.push(id);
          g.quantity = (g.quantity ?? 1) + (item.quantity ?? 1);
          g.price = (g.price ?? 0) + (item.estate_price ?? 0);
          continue;
        }
        const lot: MergedLot = {
          name: item.group_name || item.name,
          members: [id],
          best: id,
          quantity: item.quantity ?? 1,
          price: item.estate_price ?? 0,
          wall: item.wall,
          not_for_sale: item.not_for_sale,
        };
        groups.set(item.group_id, lot);
        merged.push(lot);
      } else {
        merged.push({ name: item.name, members: [id], best: id, quantity: item.quantity ?? 1, price: item.estate_price ?? 0, wall: item.wall, not_for_sale: item.not_for_sale });
      }
    }
  } else {
    const { result } = await call<{ result: { lots?: MergedLot[] } }>('consolidate', {
      listing: listing.join('\n'),
      thumbs,
    });
    merged = Array.isArray(result.lots) ? result.lots : [];
  }

  // Rows the merge left out are kept as their own lots rather than silently lost.
  const used = new Set(merged.flatMap((l) => l.members || []));
  for (const [id, { item }] of byId) {
    if (!used.has(id)) {
      merged.push({ name: item.name, members: [id], best: id, quantity: item.quantity ?? 1, price: item.estate_price ?? 0, wall: item.wall, not_for_sale: item.not_for_sale });
    }
  }

  const images = new Map<string, File>();
  const lots: (CaptureLot & { _order: [number, number] })[] = [];
  const prices = merged.filter((l) => !l.not_for_sale).map((l) => Number(l.price) || 0).sort((a, b) => b - a);
  const top = prices.length ? prices[Math.max(0, Math.floor(prices.length * 0.15) - 1)] : 0;
  merged.forEach((l, i) => {
    const members = (l.members || []).filter((m) => byId.has(m));
    if (!members.length) return;
    const best = l.best && byId.has(l.best) ? l.best : members[0];
    const bi = byId.get(best)!;
    const photos: string[] = [];
    for (const m of [best, ...members.filter((x) => x !== best)]) {
      const crop = byId.get(m)!.crop;
      if (!crop) continue;
      const path = `crops/${m}.jpg`;
      images.set(path, new File([crop.blob], `${m}.jpg`, { type: 'image/jpeg' }));
      photos.push(path);
    }
    const said = [...new Set(members.flatMap((m) => spoken(byId.get(m)!.item.spoken_facts)))];
    const restricted = members.some((m) => byId.get(m)!.item.possibly_restricted);
    const price = Math.round(Number(l.price) || 0);
    const bestCrop = bi.crop;
    const small = !bestCrop || Math.min(bestCrop.width, bestCrop.height) < 400;
    const order = members
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
      not_for_sale: !!l.not_for_sale,
      possibly_restricted: restricted,
      needs_detail: !l.not_for_sale && (price >= top || restricted || small),
      members,
      photos,
      _order: order,
    });
  });
  lots.sort((a, b) => a._order[0] - b._order[0] || a._order[1] - b._order[1]);

  const pkg: CapturePackage = {
    format: 'room-capture',
    version: 1,
    source: `${clips.length} walkthrough clip${clips.length > 1 ? 's' : ''}, analysed in the app`,
    captured: new Date().toISOString().slice(0, 10),
    room: roomCode ? { name: room, code: roomCode } : { name: room },
    lots: lots.map(({ _order, ...l }) => l),
  };
  return { pkg, images };
}
