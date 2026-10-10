// worker/room-capture/index.mjs
// Room capture worker on Google Cloud Run: the parts of the pipeline that need a
// real server next to the videos. The `room-capture` Supabase edge function is
// the orchestrator and calls this service with a shared secret; this service
// never holds a Supabase or Gemini key.
//
//   POST /upload-session  a resumable Google Cloud Storage upload session for one
//                         clip; the phone uploads straight to it.
//   POST /transfer        copy a stored clip into a Gemini upload session the
//                         edge function opened (Google to Google, 8 MiB at a time).
//   POST /crop            cut every item's photo from a room's clips (ffmpeg:
//                         sharpest frame near the item's time; boxes refined by
//                         the edge function's `refine_internal`), upload them to
//                         Supabase storage through signed upload URLs the edge
//                         function made, write crops/manifest.json, delete the
//                         videos, then report back (`crop_done`). Answers 202 at
//                         once and works in the background (deployed with
//                         --no-cpu-throttling).
//   POST /delete          delete clips (discarded rooms, imported rooms).
//   GET  /video           a clip, with Range support, for the app's fallback
//                         cutting; authorised by an expiring HMAC the edge
//                         function signs (a video element cannot send headers).
//
// Env: BUCKET, WORKER_SECRET, EDGE_URL (the room-capture function URL).
// Storage access comes from the service account the service runs as.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

const PORT = Number(process.env.PORT) || 8080;
const BUCKET = process.env.BUCKET || '';
const SECRET = process.env.WORKER_SECRET || '';
const EDGE_URL = process.env.EDGE_URL || '';
const GCS = 'https://storage.googleapis.com';
const GEMINI_CHUNK = 8 * 1024 * 1024; // every chunk but the last a multiple of 8 MiB
const MAX_CROP_JOBS = 2; // per instance; each holds one clip on disk (in memory) at a time

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errText = (e) => String(e?.message ?? e).slice(0, 400);
const log = (...a) => console.log('[worker]', ...a);

// <companyId>/<saleId>/<jobId>/<clipId>.<ext>, all UUIDs.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const OBJECT_RE = new RegExp(`^${UUID}/${UUID}/${UUID}/${UUID}\\.[a-z0-9]{2,5}$`);
const validObject = (o) => typeof o === 'string' && OBJECT_RE.test(o);

// ---- Google credentials (the service account, from the metadata server) ----

let cached = { token: '', exp: 0 };
async function token() {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!r.ok) throw new Error(`metadata_token ${r.status}`);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

const objectUrl = (o) => `${GCS}/storage/v1/b/${BUCKET}/o/${encodeURIComponent(o)}`;

async function deleteObject(o) {
  const r = await fetch(objectUrl(o), { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } });
  if (!r.ok && r.status !== 404) throw new Error(`gcs_delete ${r.status}`);
}

async function download(o, file) {
  const r = await fetch(`${objectUrl(o)}?alt=media`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!r.ok || !r.body) throw new Error(`gcs_read ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
}

// ---- Upload session ----

async function uploadSession({ object, size, contentType, origin }) {
  if (!validObject(object)) throw httpError(400, 'bad_object');
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) throw httpError(400, 'bad_size');
  const r = await fetch(`${GCS}/upload/storage/v1/b/${BUCKET}/o?uploadType=resumable&name=${encodeURIComponent(object)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': String(contentType || 'video/mp4'),
      'X-Upload-Content-Length': String(n),
      // The session answers CORS for the origin that opened it.
      ...(origin ? { Origin: String(origin) } : {}),
    },
    body: JSON.stringify({ name: object, contentType: String(contentType || 'video/mp4') }),
  });
  const loc = r.headers.get('location');
  if (!r.ok || !loc) throw new Error(`upload_session ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return { uploadUrl: loc };
}

// ---- Clip -> Gemini ----

async function transfer({ object, uploadUrl }) {
  if (!validObject(object)) throw httpError(400, 'bad_object');
  if (typeof uploadUrl !== 'string' || !uploadUrl.startsWith('https://generativelanguage.googleapis.com/')) throw httpError(400, 'bad_upload_url');
  const r = await fetch(`${objectUrl(object)}?alt=media`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!r.ok || !r.body) throw new Error(`gcs_read ${r.status}`);
  let offset = 0;
  let file = null;
  const send = async (data, last) => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'X-Goog-Upload-Offset': String(offset), 'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload' },
        body: data,
      });
      if (res.ok) {
        offset += data.length;
        if (last) file = (await res.json())?.file ?? null;
        return;
      }
      const text = (await res.text().catch(() => '')).slice(0, 200);
      if (attempt >= 3 || res.status < 500) throw new Error(`gemini_upload ${res.status}: ${text}`);
      await sleep(1500 * attempt);
    }
  };
  let parts = [];
  let len = 0;
  for await (const chunk of r.body) {
    parts.push(chunk);
    len += chunk.length;
    // Keep at least one byte back so the last send always carries data.
    while (len > GEMINI_CHUNK) {
      const all = Buffer.concat(parts, len);
      await send(all.subarray(0, GEMINI_CHUNK), false);
      const rest = all.subarray(GEMINI_CHUNK);
      parts = [rest];
      len = rest.length;
    }
  }
  await send(Buffer.concat(parts, len), true);
  if (!file?.name) throw new Error('gemini_upload_no_file');
  return { file: { name: file.name, uri: file.uri ?? null, mimeType: file.mimeType ?? null } };
}

// ---- Cutting photos ----

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`))));
  });
}

const tsSeconds = (ts) => {
  if (!ts) return 0;
  const parts = String(ts).split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};

/** Laplacian variance of a small grayscale copy: higher = sharper. */
async function sharpness(buf) {
  const { data, info } = await sharp(buf).greyscale().resize(240).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const c = info.channels;
  const g = (x, y) => data[(y * w + x) * c];
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const lap = 4 * g(x, y) - g(x - 1, y) - g(x + 1, y) - g(x, y - 1) - g(x, y + 1);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** The sharpest frame within ~0.4 s of `t` (motion blur was the biggest problem). */
async function bestFrame(file, t, dir) {
  const fdir = await fs.mkdtemp(path.join(dir, 'f-'));
  try {
    const start = Math.max(0, t - 0.4);
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', start.toFixed(3), '-i', file,
      '-t', '0.9', '-vf', 'fps=5', '-q:v', '2', path.join(fdir, '%02d.jpg')]).catch(() => undefined);
    let names = (await fs.readdir(fdir)).filter((n) => n.endsWith('.jpg')).sort();
    if (!names.length) {
      // A time past the end of the clip: take its last frame.
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-sseof', '-0.5', '-i', file,
        '-frames:v', '1', '-q:v', '2', path.join(fdir, 'last.jpg')]).catch(() => undefined);
      names = (await fs.readdir(fdir)).filter((n) => n.endsWith('.jpg'));
    }
    let best = null;
    let bestScore = -1;
    for (const n of names) {
      const buf = await fs.readFile(path.join(fdir, n));
      const s = await sharpness(buf).catch(() => -1);
      if (s > bestScore) {
        bestScore = s;
        best = buf;
      }
    }
    if (!best) return null;
    const small = await sharp(best).resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    return { full: best, small };
  } finally {
    await fs.rm(fdir, { recursive: true, force: true });
  }
}

function boxPx(box, W, H, pad) {
  let [y0, x0, y1, x1] = Array.isArray(box) && box.length === 4 ? box.map(Number) : [0, 0, 1000, 1000];
  if (!(y1 > y0 && x1 > x0)) [y0, x0, y1, x1] = [0, 0, 1000, 1000];
  const px = ((x1 - x0) / 1000) * W * pad;
  const py = ((y1 - y0) / 1000) * H * pad;
  const left = Math.max(0, Math.round((x0 / 1000) * W - px));
  const top = Math.max(0, Math.round((y0 / 1000) * H - py));
  const right = Math.min(W, Math.round((x1 / 1000) * W + px));
  const bottom = Math.min(H, Math.round((y1 / 1000) * H + py));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

async function cropTo(full, box, pad) {
  const { width: W, height: H } = await sharp(full).metadata();
  const r = boxPx(box, W, H, pad);
  const data = await sharp(full).extract(r).jpeg({ quality: 90 }).toBuffer();
  return { data, width: r.width, height: r.height };
}

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) await fn(list[i++]);
  }));
}

async function edge(body) {
  const r = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-secret': SECRET },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`edge ${body.action} ${r.status}: ${j?.error ?? ''}`);
  return j;
}

/** Tight boxes on the stills (the video pass is often offset); on failure the video boxes stand. */
async function refine(frames) {
  const boxes = new Map();
  const batches = [];
  for (let i = 0; i < frames.length; i += 20) batches.push(frames.slice(i, i + 20));
  await pool(batches, 2, async (b) => {
    try {
      const j = await edge({
        action: 'refine_internal',
        frames: b.map((f) => ({ id: f.it.id, name: f.it.name, data: f.small.toString('base64') })),
      });
      for (const x of j?.result?.boxes ?? []) {
        if (x && typeof x.id === 'number' && Array.isArray(x.box_2d) && x.box_2d.length === 4) boxes.set(x.id, x.box_2d);
      }
    } catch (e) {
      console.error('[worker] refine failed; using the video boxes:', errText(e));
    }
  });
  return boxes;
}

async function putSigned(url, data, contentType) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType, 'x-upsert': 'true' }, body: data });
    if (r.ok) return;
    if (attempt >= 3) throw new Error(`photo_upload ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
    await sleep(1000 * attempt);
  }
}

async function cropJob(job) {
  const started = Date.now();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'job-'));
  const manifest = { version: 1, clips: {} };
  try {
    for (const clip of job.clips) {
      const file = path.join(dir, 'clip');
      await download(clip.object, file);
      const frames = [];
      for (const it of clip.items) {
        const f = await bestFrame(file, tsSeconds(it.timestamp), dir);
        if (f) frames.push({ it, ...f });
      }
      await fs.rm(file, { force: true });
      const boxes = await refine(frames);
      const entry = { sig: clip.sig, items: {} };
      await pool(frames, 4, async (f) => {
        const p = `${job.folder}/crops/${clip.clipId}-${f.it.id}.jpg`;
        const url = job.uploads[p];
        if (!url) return;
        const refined = boxes.get(f.it.id);
        const out = await cropTo(f.full, refined ?? f.it.box_2d, refined ? 0.06 : 0.08);
        await putSigned(url, out.data, 'image/jpeg');
        entry.items[f.it.id] = { path: p, width: out.width, height: out.height };
      });
      manifest.clips[clip.clipId] = entry;
      log(`job ${job.jobId}: clip ${clip.clipId} cut, ${frames.length} photos`);
    }
    await putSigned(job.manifestUpload, Buffer.from(JSON.stringify(manifest)), 'application/json');
    // The photos are cut: the videos are no longer needed.
    let videosDeleted = true;
    for (const o of job.objects) {
      try {
        await deleteObject(o);
      } catch (e) {
        videosDeleted = false;
        console.error('[worker] delete', o, errText(e));
      }
    }
    log(`job ${job.jobId}: done in ${Math.round((Date.now() - started) / 1000)} s`);
    await edge({ action: 'crop_done', jobId: job.jobId, ok: true, videosDeleted });
  } catch (e) {
    console.error(`[worker] job ${job.jobId}:`, e);
    await edge({ action: 'crop_done', jobId: job.jobId, ok: false, error: errText(e) }).catch((e2) =>
      console.error('[worker] crop_done failed:', errText(e2)));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// One instance runs a couple of rooms at a time; the rest wait their turn.
let active = 0;
const queue = [];
function enqueueCrop(job) {
  queue.push(job);
  const next = () => {
    while (active < MAX_CROP_JOBS && queue.length) {
      const j = queue.shift();
      active++;
      cropJob(j).finally(() => {
        active--;
        next();
      });
    }
  };
  next();
}

function validCropJob(b) {
  if (!b || typeof b.jobId !== 'string' || typeof b.folder !== 'string' || typeof b.manifestUpload !== 'string') return false;
  if (!b.uploads || typeof b.uploads !== 'object' || !Array.isArray(b.clips) || !Array.isArray(b.objects)) return false;
  if (!b.objects.every(validObject)) return false;
  return b.clips.every((c) => c && typeof c.clipId === 'string' && validObject(c.object) && Array.isArray(c.items) && typeof c.sig === 'string');
}

// ---- Video for the app's fallback cutting ----

const hmac = (o, e) => crypto.createHmac('sha256', SECRET).update(`${o}\n${e}`).digest('hex');

async function video(req, res, url) {
  const o = url.searchParams.get('o') || '';
  const e = Number(url.searchParams.get('e'));
  const s = url.searchParams.get('s') || '';
  const want = hmac(o, e);
  if (!validObject(o) || !(e > Date.now() / 1000) || s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) {
    res.writeHead(403, { 'Access-Control-Allow-Origin': '*' });
    res.end('forbidden');
    return;
  }
  const headers = { Authorization: `Bearer ${await token()}` };
  if (req.headers.range) headers.Range = req.headers.range;
  const r = await fetch(`${objectUrl(o)}?alt=media`, { headers });
  const out = {
    'Content-Type': r.headers.get('content-type') || 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=600',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  };
  for (const h of ['content-length', 'content-range']) {
    const v = r.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(r.status, out);
  if (!r.body || req.method === 'HEAD') {
    res.end();
    return;
  }
  Readable.fromWeb(r.body).pipe(res);
}

// ---- HTTP ----

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function readJson(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(httpError(413, 'too_large'));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(httpError(400, 'bad_json'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const authorised = (req) => {
  const got = String(req.headers['x-worker-secret'] || '');
  return !!SECRET && got.length === SECRET.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(SECRET));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://worker');
    try {
      if (url.pathname === '/video') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Max-Age': '3600',
          });
          res.end();
          return;
        }
        if (req.method === 'GET' || req.method === 'HEAD') {
          await video(req, res, url);
          return;
        }
      }
      if (req.method === 'GET' && url.pathname === '/') {
        send(res, 200, { ok: true, active, queued: queue.length });
        return;
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
      if (!authorised(req)) return send(res, 403, { error: 'forbidden' });
      const body = await readJson(req);
      if (url.pathname === '/upload-session') return send(res, 200, await uploadSession(body));
      if (url.pathname === '/transfer') return send(res, 200, await transfer(body));
      if (url.pathname === '/crop') {
        if (!validCropJob(body)) return send(res, 400, { error: 'bad_job' });
        enqueueCrop(body);
        return send(res, 202, { accepted: true, position: queue.length });
      }
      if (url.pathname === '/selftest') {
        // ffmpeg + sharp on a generated clip: the cutting path without a real room.
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'selftest-'));
        try {
          const file = path.join(dir, 'clip.mp4');
          await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30',
            '-t', '6', '-pix_fmt', 'yuv420p', file]);
          const f = await bestFrame(file, 3, dir);
          const late = await bestFrame(file, 60, dir); // past the end: last frame
          const crop = f ? await cropTo(f.full, [250, 250, 750, 750], 0.06) : null;
          return send(res, 200, {
            frame: !!f, smallBytes: f?.small.length ?? 0, lateFrame: !!late,
            crop: crop ? { width: crop.width, height: crop.height, bytes: crop.data.length } : null,
          });
        } finally {
          await fs.rm(dir, { recursive: true, force: true });
        }
      }
      if (url.pathname === '/delete') {
        const objects = (Array.isArray(body.objects) ? body.objects : []).filter(validObject);
        let failed = 0;
        for (const o of objects) await deleteObject(o).catch(() => { failed++; });
        return send(res, 200, { deleted: objects.length - failed, failed });
      }
      send(res, 404, { error: 'not_found' });
    } catch (e) {
      console.error('[worker]', req.method, url.pathname, e);
      if (!res.headersSent) send(res, e.status || 500, { error: errText(e) });
      else res.end();
    }
  })
  .listen(PORT, () => log(`listening on ${PORT}; bucket ${BUCKET || '(unset)'}`));
