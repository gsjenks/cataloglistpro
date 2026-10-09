// src/services/RoomCaptureQueue.ts
// Room capture on the server, phone side: each recorded clip is kept on the
// device (IndexedDB) and uploaded to the private room-capture bucket with the
// resumable (TUS) protocol, so switching to the camera, losing signal or a reload
// only pauses it. Once a clip is up, the room-capture edge function analyses it in
// the background; the phone is free to film the next room. One upload at a time
// (a phone sending several large videos at once only slows each one down).
// The worker starts with the app (App.tsx) and on every `online` / foreground.

import { openDB, type IDBPDatabase } from 'idb';
import { supabase } from '../lib/supabase';

export const ROOM_CAPTURE_BUCKET = 'room-capture';
const TUS_CHUNK = 6 * 1024 * 1024; // Supabase requires exactly 6 MB chunks

export type JobStatus = 'recording' | 'processing' | 'consolidating' | 'ready' | 'failed' | 'imported';
export type ClipStatus = 'uploading' | 'uploaded' | 'transferring' | 'waiting' | 'analyzing' | 'done' | 'failed';

export interface RoomCaptureJob {
  id: string;
  company_id: string;
  sale_id: string;
  room_id: string | null;
  room_code: string | null;
  room_name: string;
  status: JobStatus;
  merged: { clipIds: string[]; lots: unknown[] | null } | null;
  error: string | null;
  lease_until: string | null; // on a ready room: a device is cutting its photos
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The room's folder in the bucket: its clips, and crops/ once photos are cut. */
export const jobFolder = (job: Pick<RoomCaptureJob, 'id' | 'company_id' | 'sale_id'>) =>
  `${job.company_id}/${job.sale_id}/${job.id}`;

export const JOB_COLUMNS =
  'id, company_id, sale_id, room_id, room_code, room_name, status, merged, error, lease_until, finished_at, created_at, updated_at';

export interface RoomCaptureClip {
  id: string;
  job_id: string;
  seq: number;
  file_name: string;
  storage_path: string;
  size: number;
  mime_type: string;
  status: ClipStatus;
  result: { summary?: string; transcript?: string; items?: unknown[] } | null;
  error: string | null;
  created_at: string;
}

/** A clip waiting on this device to finish uploading. */
interface PendingUpload {
  clipId: string;
  jobId: string;
  path: string;
  blob: Blob;
  type: string;
  tusUrl?: string;
  error?: string; // a permanent failure; skipped until retried
  createdAt: number;
}

export interface UploadProgress {
  sent: number;
  total: number;
  error?: string;
  active: boolean;
}

// ---- Device store ----

let dbPromise: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbPromise ??= openDB('RoomCaptureUploads', 1, {
    upgrade(d) {
      d.createObjectStore('uploads', { keyPath: 'clipId' });
    },
  }));

async function pendingUploads(): Promise<PendingUpload[]> {
  const all = (await (await db()).getAll('uploads')) as PendingUpload[];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

// ---- Progress, for the screen ----

const progress = new Map<string, UploadProgress>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeUploads(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uploadProgress(clipId: string): UploadProgress | undefined {
  return progress.get(clipId);
}

async function refreshProgressFromStore() {
  for (const u of await pendingUploads()) {
    if (!progress.has(u.clipId)) progress.set(u.clipId, { sent: 0, total: u.blob.size, error: u.error, active: false });
  }
  emit();
}

// ---- TUS upload ----

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('Not signed in.');
  return t;
}

const endpoint = () => `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`;

class PermanentError extends Error {}

async function tusCreate(u: PendingUpload): Promise<string> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(u.blob.size),
      'x-upsert': 'true',
      'Upload-Metadata': [
        `bucketName ${b64(ROOM_CAPTURE_BUCKET)}`,
        `objectName ${b64(u.path)}`,
        `contentType ${b64(u.type || 'video/mp4')}`,
        `cacheControl ${b64('3600')}`,
      ].join(','),
    },
  });
  const loc = res.headers.get('Location');
  if (res.status === 413) throw new PermanentError('This video is larger than the storage upload limit (Storage → Settings).');
  if (res.status === 401 || res.status === 403) throw new Error(`Upload not allowed (${res.status}).`);
  if (!res.ok || !loc) throw new Error(`Could not start the upload (${res.status}): ${(await res.text().catch(() => '')).slice(0, 160)}`);
  return new URL(loc, endpoint()).toString();
}

/** Where the server says the upload is; null if the upload session is gone. */
async function tusOffset(url: string): Promise<number | null> {
  const res = await fetch(url, {
    method: 'HEAD',
    headers: { Authorization: `Bearer ${await token()}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Tus-Resumable': '1.0.0' },
  });
  if (res.status === 404 || res.status === 410 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Upload check failed (${res.status}).`);
  return Number(res.headers.get('Upload-Offset')) || 0;
}

async function uploadOne(u: PendingUpload) {
  const p: UploadProgress = { sent: 0, total: u.blob.size, active: true };
  progress.set(u.clipId, p);
  emit();

  let url = u.tusUrl;
  let offset = url ? await tusOffset(url) : null;
  if (url == null || offset == null) {
    url = await tusCreate(u);
    offset = 0;
    await (await db()).put('uploads', { ...u, tusUrl: url });
  }
  p.sent = offset;
  emit();

  while (offset < u.blob.size) {
    const end = Math.min(u.blob.size, offset + TUS_CHUNK);
    const res: Response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${await token()}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      body: u.blob.slice(offset, end),
    });
    if (res.status === 409) {
      // Out of step with the server: ask where it is and carry on from there.
      const at = await tusOffset(url);
      if (at == null) throw new Error('The upload session expired; starting over.');
      offset = at;
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      await (await db()).put('uploads', { ...u, tusUrl: undefined });
      throw new Error('The upload session expired; starting over.');
    }
    if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 160)}`);
    offset = Number(res.headers.get('Upload-Offset')) || end;
    p.sent = offset;
    emit();
  }

  // Up: hand it to the server.
  const { error } = await supabase.from('room_capture_clips').update({ status: 'uploaded', updated_at: new Date().toISOString() }).eq('id', u.clipId);
  if (error) throw new Error(`Uploaded, but could not mark the clip: ${error.message}`);
  await (await db()).delete('uploads', u.clipId);
  p.active = false;
  emit();
  kickJob(u.jobId).catch((e) => console.error('[ROOM CAPTURE] kick after upload failed:', e));
}

// ---- Worker ----

let running = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** Upload whatever is waiting on this device. Safe to call any time. */
export function pumpUploads() {
  if (running) return;
  running = true;
  const work = async () => {
    try {
      let failures = 0;
      for (;;) {
        if (!navigator.onLine) break;
        const next = (await pendingUploads()).find((u) => !u.error);
        if (!next) break;
        try {
          await uploadOne(next);
          failures = 0;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[ROOM CAPTURE] upload:', msg);
          const p = progress.get(next.clipId);
          if (e instanceof PermanentError) {
            await (await db()).put('uploads', { ...next, error: msg });
            await supabase.from('room_capture_clips').update({ status: 'failed', error: msg }).eq('id', next.clipId);
            if (p) Object.assign(p, { error: msg, active: false });
          } else if (p) {
            Object.assign(p, { error: `${msg} Retrying…`, active: false });
          }
          emit();
          if (!(e instanceof PermanentError) && ++failures >= 3) {
            // Back off; the next foreground / online event or this timer resumes.
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(pumpUploads, 30_000);
            break;
          }
        }
      }
    } finally {
      running = false;
    }
  };
  // One tab uploads at a time.
  const locks = (navigator as Navigator & { locks?: { request: (n: string, o: object, cb: (lock: unknown) => Promise<void>) => Promise<unknown> } }).locks;
  if (locks) {
    locks
      .request('room-capture-upload', { ifAvailable: true }, async (lock) => {
        if (lock) await work();
        else running = false; // another tab is uploading
      })
      .catch(() => { running = false; });
  } else {
    work();
  }
}

let started = false;
/** Called once at app start: resume uploads left from before. */
export function startRoomCaptureUploads() {
  if (started) return;
  started = true;
  refreshProgressFromStore().catch(() => undefined);
  pumpUploads();
  window.addEventListener('online', pumpUploads);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pumpUploads();
  });
}

// ---- Jobs and clips ----

/** The room's job still taking clips, or a new one. */
export async function openJobForRoom(opts: {
  companyId: string;
  saleId: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  saleContext: string;
}): Promise<RoomCaptureJob> {
  const { data: existing, error } = await supabase
    .from('room_capture_jobs')
    .select('*')
    .eq('sale_id', opts.saleId)
    .eq('room_id', opts.roomId)
    .eq('status', 'recording')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  if (existing?.length) return existing[0] as RoomCaptureJob;
  const { data, error: insErr } = await supabase
    .from('room_capture_jobs')
    .insert({
      company_id: opts.companyId,
      sale_id: opts.saleId,
      room_id: opts.roomId,
      room_code: opts.roomCode,
      room_name: opts.roomName,
      sale_context: opts.saleContext,
    })
    .select('*')
    .single();
  if (insErr) throw new Error(insErr.message);
  return data as RoomCaptureJob;
}

const extOf = (f: File) => {
  const m = f.name.match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return f.type === 'video/quicktime' ? 'mov' : f.type === 'video/webm' ? 'webm' : 'mp4';
};

/** Save the clips on this device, record them, and start uploading. */
export async function addClips(job: RoomCaptureJob, files: File[]): Promise<void> {
  const { data: last } = await supabase
    .from('room_capture_clips')
    .select('seq')
    .eq('job_id', job.id)
    .order('seq', { ascending: false })
    .limit(1);
  let seq = (last?.[0]?.seq ?? 0) as number;
  for (const file of files) {
    const id = crypto.randomUUID();
    const path = `${job.company_id}/${job.sale_id}/${job.id}/${id}.${extOf(file)}`;
    const type = file.type || 'video/mp4';
    // On the device first: a failed insert below leaves nothing behind, but a
    // recorded clip is never only in memory.
    await (await db()).put('uploads', { clipId: id, jobId: job.id, path, blob: file, type, createdAt: Date.now() + seq });
    const { error } = await supabase.from('room_capture_clips').insert({
      id,
      job_id: job.id,
      seq: ++seq,
      file_name: file.name,
      storage_path: path,
      size: file.size,
      mime_type: type,
    });
    if (error) {
      await (await db()).delete('uploads', id);
      throw new Error(`Could not record the clip: ${error.message}`);
    }
    progress.set(id, { sent: 0, total: file.size, active: false });
  }
  emit();
  pumpUploads();
}

/** Clear a permanent upload error so the clip is tried again. */
export async function retryUpload(clipId: string) {
  const d = await db();
  const u = (await d.get('uploads', clipId)) as PendingUpload | undefined;
  if (!u) return false;
  await d.put('uploads', { ...u, error: undefined });
  await supabase.from('room_capture_clips').update({ status: 'uploading', error: null }).eq('id', clipId);
  progress.set(clipId, { sent: 0, total: u.blob.size, active: false });
  emit();
  pumpUploads();
  return true;
}

/** Drop a clip: device copy, stored video and row. */
export async function removeClip(clip: Pick<RoomCaptureClip, 'id' | 'storage_path'>) {
  await (await db()).delete('uploads', clip.id);
  progress.delete(clip.id);
  await supabase.storage.from(ROOM_CAPTURE_BUCKET).remove([clip.storage_path]).catch(() => undefined);
  const { error } = await supabase.from('room_capture_clips').delete().eq('id', clip.id);
  emit();
  if (error) throw new Error(error.message);
}

export async function hasDeviceCopy(clipId: string): Promise<boolean> {
  return !!(await (await db()).get('uploads', clipId));
}

export async function listJobs(saleId: string): Promise<RoomCaptureJob[]> {
  const { data, error } = await supabase
    .from('room_capture_jobs')
    .select(JOB_COLUMNS)
    .eq('sale_id', saleId)
    .neq('status', 'imported')
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as RoomCaptureJob[];
}

export async function listClips(jobIds: string[], withResults = false): Promise<RoomCaptureClip[]> {
  if (!jobIds.length) return [];
  const { data, error } = await supabase
    .from('room_capture_clips')
    .select(`id, job_id, seq, file_name, storage_path, size, mime_type, status, error, created_at${withResults ? ', result' : ''}`)
    .in('job_id', jobIds)
    .order('seq');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RoomCaptureClip[]).map((c) => ({ ...c, result: c.result ?? null }));
}

export async function countReadyRooms(saleId: string): Promise<number> {
  const { count } = await supabase
    .from('room_capture_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('sale_id', saleId)
    .eq('status', 'ready');
  return count ?? 0;
}

async function call(action: string, body: Record<string, unknown>) {
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
  return data;
}

export const kickJob = (jobId: string) => call('kick', { jobId });
export const finishJob = (jobId: string) => call('finish_job', { jobId });
export const retryClip = (clipId: string) => call('retry_clip', { clipId });
/** Delete the room's videos and cut photos; `discard` also removes the room from the list. */
export async function cleanupJob(job: RoomCaptureJob, discard = false) {
  // The crops are only written by the app, so the app removes them.
  const dir = `${jobFolder(job)}/crops`;
  const { data: files } = await supabase.storage.from(ROOM_CAPTURE_BUCKET).list(dir, { limit: 1000 });
  if (files?.length) {
    await supabase.storage.from(ROOM_CAPTURE_BUCKET).remove(files.map((f) => `${dir}/${f.name}`)).catch(() => undefined);
  }
  return call('cleanup_job', { jobId: job.id, discard });
}

export async function clipVideoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(ROOM_CAPTURE_BUCKET).createSignedUrl(path, 3 * 3600);
  if (error || !data?.signedUrl) throw new Error(`Could not open the clip: ${error?.message ?? 'no link'}`);
  return data.signedUrl;
}
