// src/services/RoomCaptureVideoService.ts
// Narrated walkthrough videos -> a room-capture package for the review screen.
// The clips are uploaded and analysed on the server (RoomCaptureQueue and the
// room-capture edge function); the server cannot cut photos from a video, so the
// app does it, in the background, as soon as a room is ready: each item's crop
// is cut from the sharpest frame near its timestamp, read straight from the
// stored clip, and saved to the room's crops/ folder with a manifest. Review then
// only downloads them, and the server's room-wide merge turns the items into
// lots. See docs/room-capture-spec.md.

import { supabase } from '../lib/supabase';
import type { CaptureLot, CaptureMember, CapturePackage } from './RoomCaptureImportService';
import {
  clipVideoUrl, jobFolder, listClips, JOB_COLUMNS, ROOM_CAPTURE_BUCKET,
  type RoomCaptureClip, type RoomCaptureJob,
} from './RoomCaptureQueue';

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

/** Thrown when background cutting has to stop (app hidden); it resumes later. */
export class CropPaused extends Error {}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, Math.min(t, (v.duration || t) - 0.05));
    if (Math.abs(v.currentTime - target) < 0.001 && v.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      v.removeEventListener('seeked', done);
      resolve();
    };
    // A seek that never lands (a hidden tab stops decoding) must not hand back
    // the previous frame as this item's photo.
    const timer = setTimeout(() => {
      v.removeEventListener('seeked', done);
      reject(document.visibilityState === 'visible' ? new Error('The video stopped responding.') : new CropPaused('paused'));
    }, 8000);
    v.addEventListener('seeked', done);
    v.currentTime = target;
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
  shouldStop?: () => boolean,
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
      if (shouldStop?.()) throw new CropPaused('paused');
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

// ---- Saved crops ----
//
// <room folder>/crops/<clipId>-<itemId>.jpg plus crops/manifest.json, which
// records per clip the items it was cut for (so a clip analysed again is cut
// again) and each crop's size (Review flags small crops for a detail shot).

interface CropManifest {
  version: 1;
  clips: Record<string, { sig: string; items: Record<string, { path: string; width: number; height: number }> }>;
}

const manifestPath = (job: RoomCaptureJob) => `${jobFolder(job)}/crops/manifest.json`;
const clipItems = (c: RoomCaptureClip) =>
  ((c.result?.items ?? []) as ClipItem[]).filter((i) => i && typeof i.id === 'number');
const clipSig = (c: RoomCaptureClip) => clipItems(c).map((i) => `${i.id}:${i.name}`).join('|');
const covered = (m: CropManifest, c: RoomCaptureClip) => m.clips[c.id]?.sig === clipSig(c);

/** The analysed clips in the order the server merged them. */
function doneClips(job: RoomCaptureJob, clips: RoomCaptureClip[]) {
  const done = clips.filter((c) => c.job_id === job.id && c.status === 'done' && c.result);
  const order = job.merged?.clipIds?.length ? job.merged.clipIds : done.map((c) => c.id);
  return order.map((id) => done.find((c) => c.id === id)).filter((c): c is RoomCaptureClip => !!c);
}

async function readManifest(job: RoomCaptureJob): Promise<CropManifest> {
  const { data, error } = await supabase.storage.from(ROOM_CAPTURE_BUCKET).download(manifestPath(job));
  if (!error && data) {
    try {
      const m = JSON.parse(await data.text());
      if (m?.version === 1 && m.clips && typeof m.clips === 'object') return m as CropManifest;
    } catch {
      /* missing or unreadable: start over */
    }
  }
  return { version: 1, clips: {} };
}

async function writeManifest(job: RoomCaptureJob, m: CropManifest) {
  const { error } = await supabase.storage
    .from(ROOM_CAPTURE_BUCKET)
    .upload(manifestPath(job), new Blob([JSON.stringify(m)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  if (error) throw new Error(`Could not save the photo list: ${error.message}`);
}

/** Run `fn` over `list`, `n` at a time. */
async function pool<T>(list: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) await fn(list[i++]);
  }));
}

// Progress per room, for the Rooms list and Review.
export interface CropProgress { fraction: number; label: string }
const cropProgress = new Map<string, CropProgress>();
/** Rooms whose photos are all cut (keyed by id + updated_at: a re-merge resets it). */
const cropsDone = new Set<string>();
const cropListeners = new Set<() => void>();
const emitCrops = () => cropListeners.forEach((l) => l());
const doneKey = (job: RoomCaptureJob) => `${job.id}@${job.updated_at}`;
const setCropProgress = (jobId: string, p: CropProgress | null) => {
  if (p) cropProgress.set(jobId, p);
  else cropProgress.delete(jobId);
  emitCrops();
};

export function subscribeCrops(fn: () => void): () => void {
  cropListeners.add(fn);
  return () => cropListeners.delete(fn);
}

/** What the Rooms list shows for a ready room's photos. */
export function cropState(job: RoomCaptureJob):
  | { kind: 'cutting'; progress: CropProgress }
  | { kind: 'done' }
  | { kind: 'elsewhere' }
  | { kind: 'pending' } {
  const p = cropProgress.get(job.id);
  if (p) return { kind: 'cutting', progress: p };
  if (cropsDone.has(doneKey(job))) return { kind: 'done' };
  if (job.lease_until && new Date(job.lease_until).getTime() > Date.now()) return { kind: 'elsewhere' };
  return { kind: 'pending' };
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Cut and save the photos of every clip not cut yet. With `load`, also return
 * every clip's crops (Review); in the background only the cutting is done, and it
 * stops (CropPaused) when the app is hidden.
 */
async function ensureJobCrops(
  job: RoomCaptureJob,
  clips: RoomCaptureClip[],
  opts: { load: boolean; background: boolean },
): Promise<Map<string, Map<number, Crop>>> {
  // One run per room on this device; Review waits for a background run, then loads.
  const running = inflight.get(job.id);
  if (running) await running.catch(() => undefined);
  const run = (async () => {
    const out = new Map<string, Map<number, Crop>>();
    const ordered = doneClips(job, clips);
    const m = await readManifest(job);
    const todo = ordered.filter((c) => !covered(m, c));
    const stop = opts.background ? () => document.visibilityState !== 'visible' : undefined;
    try {
      for (let k = 0; k < todo.length; k++) {
        const c = todo[k];
        const label = `Cutting photos: clip ${k + 1} of ${todo.length}`;
        setCropProgress(job.id, { fraction: k / todo.length, label });
        const crops = await cropItems(await clipVideoUrl(c.storage_path), clipItems(c), (f) =>
          setCropProgress(job.id, { fraction: (k + f) / todo.length, label }), undefined, true, stop);
        const entry: CropManifest['clips'][string] = { sig: clipSig(c), items: {} };
        await pool([...crops.entries()], 4, async ([id, crop]) => {
          const path = `${jobFolder(job)}/crops/${c.id}-${id}.jpg`;
          const { error } = await supabase.storage
            .from(ROOM_CAPTURE_BUCKET)
            .upload(path, crop.blob, { upsert: true, contentType: 'image/jpeg' });
          if (error) throw new Error(`Could not save a photo: ${error.message}`);
          entry.items[id] = { path, width: crop.width, height: crop.height };
        });
        m.clips[c.id] = entry;
        await writeManifest(job, m); // after every clip, so a pause keeps what is done
        out.set(c.id, crops);
      }
      cropsDone.add(doneKey(job));
      if (!opts.load) return out;
      // The clips cut earlier (here or on another device): download their crops.
      const rest = ordered.filter((c) => !out.has(c.id));
      const all = rest.flatMap((c) => Object.entries(m.clips[c.id]?.items ?? {}).map(([id, e]) => ({ c, id: Number(id), e })));
      let got = 0;
      if (all.length) setCropProgress(job.id, { fraction: 0, label: 'Loading photos' });
      await pool(all, 6, async ({ c, id, e }) => {
        const { data } = await supabase.storage.from(ROOM_CAPTURE_BUCKET).download(e.path);
        // Storage can answer a missing object with a JSON body: only keep images.
        if (data && data.size > 0 && data.type.startsWith('image/')) {
          if (!out.has(c.id)) out.set(c.id, new Map());
          out.get(c.id)!.set(id, { blob: data, width: e.width, height: e.height });
        }
        setCropProgress(job.id, { fraction: ++got / all.length, label: 'Loading photos' });
      });
      return out;
    } finally {
      setCropProgress(job.id, null);
    }
  })();
  inflight.set(job.id, run);
  try {
    return await run;
  } finally {
    if (inflight.get(job.id) === run) inflight.delete(job.id);
  }
}

// ---- Background worker ----

let workerStarted = false;
let workerBusy = false;

/** Cut the photos of every ready room this device can see. Safe to call any time. */
export async function cutReadyRooms() {
  if (workerBusy || document.visibilityState !== 'visible' || !navigator.onLine) return;
  workerBusy = true;
  try {
    const { data, error } = await supabase.from('room_capture_jobs').select(JOB_COLUMNS).eq('status', 'ready').order('updated_at');
    if (error) throw new Error(error.message);
    for (const job of (data ?? []) as unknown as RoomCaptureJob[]) {
      if (document.visibilityState !== 'visible') break;
      if (cropsDone.has(doneKey(job)) || inflight.has(job.id)) continue;
      if (job.lease_until && new Date(job.lease_until).getTime() > Date.now()) continue; // another device
      const clips = await listClips([job.id], true);
      const m = await readManifest(job);
      if (doneClips(job, clips).every((c) => covered(m, c))) {
        cropsDone.add(doneKey(job));
        emitCrops();
        continue;
      }
      // Claim the room so two devices don't cut the same clips.
      const now = new Date().toISOString();
      const { data: claimed } = await supabase
        .from('room_capture_jobs')
        .update({ lease_until: new Date(Date.now() + 15 * 60_000).toISOString() })
        .eq('id', job.id)
        .eq('status', 'ready')
        .or(`lease_until.is.null,lease_until.lt.${now}`)
        .select('id')
        .maybeSingle();
      if (!claimed) continue;
      try {
        await ensureJobCrops(job, clips, { load: false, background: true });
      } finally {
        await supabase.from('room_capture_jobs').update({ lease_until: null }).eq('id', job.id).eq('status', 'ready');
      }
    }
  } catch (e) {
    if (!(e instanceof CropPaused)) console.error('[ROOM CAPTURE] cutting photos:', e);
  } finally {
    workerBusy = false;
  }
}

/** Called once at app start: cut photos for ready rooms whenever the app is open. */
export function startRoomCaptureCropWorker() {
  if (workerStarted) return;
  workerStarted = true;
  setTimeout(cutReadyRooms, 10_000);
  setInterval(cutReadyRooms, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(cutReadyRooms, 2000);
  });
}

/**
 * A room the server has finished, for Review: its photos (cut in the
 * background already, or now), then the package.
 */
export async function prepareJobPackage(
  job: RoomCaptureJob,
  clips: RoomCaptureClip[],
  onProgress: (fraction: number, label: string) => void,
): Promise<{ pkg: CapturePackage; images: Map<string, File> }> {
  const report = () => {
    const p = cropProgress.get(job.id);
    if (p) onProgress(p.fraction, p.label);
  };
  const unsub = subscribeCrops(report);
  let crops = new Map<string, Map<number, Crop>>();
  try {
    crops = await ensureJobCrops(job, clips, { load: true, background: false });
  } catch (e) {
    // The lots still come through; the ones missing a crop just have no photo.
    console.error('[ROOM CAPTURE] photos for review:', e);
  } finally {
    unsub();
  }
  onProgress(1, 'Building the lot list');
  const results = doneClips(job, clips).map((c) => ({
    label: c.file_name,
    result: {
      summary: c.result?.summary ?? '',
      transcript: c.result?.transcript ?? '',
      items: clipItems(c),
      crops: crops.get(c.id) ?? new Map<number, Crop>(),
    },
  }));
  return buildRoomPackage(
    job.room_name || 'Room',
    results,
    job.room_code ?? undefined,
    (job.merged?.lots as MergedLot[] | null) ?? null,
  );
}
