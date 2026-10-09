// supabase/functions/room-capture/index.ts
// Room capture from narrated walkthrough videos (docs/room-capture-spec.md).
//
// The phone uploads each clip to the private room-capture bucket (resumable) and
// records it in room_capture_clips; everything after that runs here, in the
// background, so the crew can film the next room while this one processes:
//
//   clip:  uploaded -> transferring (storage -> Gemini, 8 MiB at a time)
//          -> waiting (Gemini preparing the video) -> analyzing -> done | failed
//   room:  recording -> processing (Finish room) -> consolidating -> ready
//
// Each step is its own invocation that ends by calling this function again for
// the next one, so no single call runs into the wall-clock limit. A step owns its
// row through lease_until; if a chain breaks, `kick` (sent by the app while the
// Room capture screen is open) restarts anything whose lease has lapsed.
//
// The server cannot cut photos from a video, so the item crops are cut when a
// room is opened for review, from the stored clip (RoomCaptureVideoService).
//
// User actions (signed-in member of the job's company):
//   kick          restart stalled steps of a job; start a clip that just uploaded
//   finish_job    no more clips for this room; merge once every clip is through
//   retry_clip    run a failed clip again
//   cleanup_job   delete the room's videos (storage + Gemini); mark it imported,
//                 or discard it entirely
//   refine        a still frame per item -> a tight box (used at review time)
// Internal (x-room-capture-internal = the service key):
//   step          run the next step of one clip
//   consolidate   merge a finished room's clips into one lot list
//
// Secrets: DB_URL, DB_SERVICE_KEY, GEMINI_API_KEY.
// Optional: ROOM_CAPTURE_MODEL (default gemini-3.8-flash; falls back to
// gemini-2.5-flash if the key can't use it).
// Deployed with verify_jwt = false (config.toml): the internal calls carry no user
// JWT; user actions check the caller themselves.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const API = "https://generativelanguage.googleapis.com";
const DB_URL = Deno.env.get("DB_URL")!;
const SERVICE_KEY = Deno.env.get("DB_SERVICE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODELS = [...new Set([Deno.env.get("ROOM_CAPTURE_MODEL") || "gemini-3.8-flash", "gemini-2.5-flash"])];
const SELF = `${DB_URL}/functions/v1/room-capture`;
const BUCKET = "room-capture";
const CHUNK = 8 * 1024 * 1024; // Gemini: every chunk but the last a multiple of 8 MiB
const STEP_BUDGET_MS = 100_000; // then hand over to a fresh invocation
const LEASE_MS = 7 * 60_000; // longer than any one step can run
const MAX_ATTEMPTS = 3;

const admin = createClient(DB_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

const ANALYZE_PROMPT = (room: string, context: string) => `You are inventorying a house for an UPSCALE in-person estate sale. ${context}
This is ONE narrated walkthrough clip of the room "${room || "unknown"}". Clips are usually one wall or area each,
starting at the doorway and working left to right.

List every sellable item in the clip as a suggested lot. Count each physical item ONCE even if the camera
passes it several times.

Rules:
- Pairs and sets (pair of urns, clock garniture, matching chairs): return each member as its own item with
  the same group_id and a group_name like "Pair of cobalt porcelain urns".
- Bundle many small similar things into ONE item (books on a shelf, canes in a stand, desk accessories)
  with quantity set.
- IGNORE reflections in mirrors or glass, anything seen through doorways or windows in other rooms or
  outside, and the building itself (walls, doors, windows, built-in fireplaces, radiators, outlets).
- fixture=true for chandeliers, sconces, wall-attached mirrors, curtains/valances.
- not_for_sale=true (with a reason) for personal items (family photos, mail, papers, eyeglasses, magazines,
  electronics in use) and anything the narrator says is being kept or skipped.
- possibly_restricted=true when material may be ivory, tortoiseshell, rhino horn, protected-species
  taxidermy, or the item is a weapon.
- The NARRATION IS AUTHORITATIVE: maker, material, age, condition or price the narrator states overrides
  what the picture suggests. Set from_voice=true and put the spoken facts in spoken_facts.
- If the narrator says the clip is only for checking/validation, still list what you see; that is
  handled later.
- estate_price: the TAG price an upscale estate-sale company would put on it. Their buyers include dealers
  and collectors; quality antiques, signed pieces, period furniture, bronzes, fine porcelain and good rugs
  are priced near what they would realistically bring at a regional auction, not at yard-sale levels.
  Whole dollars.
- wall: which wall or area of the room the item is on, in the narrator's words when given ("back wall",
  "fireplace wall", "centre of the room").
- POSITION SIGNS: the crew places printed white paper cards around the room, each with ONE large bold
  POSITION number from 01 to 20, usually with "Benson Estate Sales" in small print. Some cards also show a
  room code, like "MR 1 - 02" or "MR01-02"; then the position is the number after the dash. position = the
  number on the card nearest the item: the card on the same surface, or the card shown for that stretch of
  wall. position_sign = the card text exactly as read. ONLY these printed cards count: never take a number
  from a clock, book, price sticker, sheet music, artwork, label, phone or house number. If no card is
  legible near the item, both are null. Never guess a number you cannot read; never invent cards. The cards
  themselves are not items.
- timestamp: mm:ss of the item's clearest, sharpest, most head-on view.
- box_2d: [ymin, xmin, ymax, xmax] normalized 0-1000 for the item in the frame at that timestamp.
- confidence 0-1.

Return JSON only:
{"clip_summary":"one line: what this clip covers",
 "transcript":[{"t":"00:00","text":""}],
 "items":[{"id":1,"name":"","category":"","description":"<=25 words","quantity":1,"wall":"",
   "timestamp":"mm:ss","box_2d":[0,0,0,0],"group_id":null,"group_name":null,"estate_price":0,
   "fixture":false,"not_for_sale":false,"not_for_sale_reason":null,"possibly_restricted":false,
   "from_voice":false,"spoken_facts":null,"position":null,"position_sign":null,"confidence":0.0}]}`;

const CONSOLIDATE_PROMPT = (withVideo: boolean) => `These are all the items found in several narrated walkthrough clips of ONE room,
listed per clip with that clip's narration. Each item has an id like V3-12 (clip V3, item 12) and the
time (@mm:ss) of its clearest view in that clip.${withVideo ? `
The clips themselves follow the list, each labelled with its clip id (V1, V2, ...): look at the given
times to tell whether two rows show the same physical object.` : ""}

The clips overlap: the same physical item can appear in more than one clip. The narrator may say where
pairs are split across the room ("its pair is on the other side of the room") and that some clips are only
for checking ("not to be duplicated, just for validation").

Produce the final LOT LIST for the room:
- Merge rows that are the same physical object into one lot (use the ${withVideo ? "video, " : ""}names, descriptions and narration).
- A clip the narrator says is for validation only contributes no new lots, unless it shows something no
  other clip has; then keep it.
- Join pair/set members found in different clips into one lot (a pair = ONE lot, quantity 2) when the
  narration or matching descriptions say they belong together.
- Keep everything else as its own lot. Do not drop personal/not-for-sale rows; keep their flag.
- For each lot give the best name, the best member (the member id with the clearest view), a price for the
  whole lot (sum the members of a pair), the wall/area, the position number (from the members' "pos";
  if they disagree, the one most members share; null if none), and every member id.

Return JSON only:
{"lots":[{"lot":1,"name":"","members":["V1-3","V4-7"],"best":"V1-3","quantity":1,"price":0,
  "wall":"","position":null,"not_for_sale":false,"reason":"why merged or kept"}],
 "notes":"anything uncertain"}`;

async function gemini(parts: unknown[], maxOutputTokens: number) {
  let last = "";
  for (const model of MODELS) {
    const res = await fetch(`${API}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens },
      }),
    });
    if (res.status === 404) {
      last = `${model} not available to this key`;
      console.error(last);
      continue;
    }
    if (!res.ok) throw new Error(`ai_failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("unparseable_ai_response");
      parsed = JSON.parse(m[0]);
    }
    if (Array.isArray(parsed)) parsed = parsed.find((x) => x && typeof x === "object" && !Array.isArray(x)) ?? { items: parsed };
    return {
      result: parsed as Record<string, unknown>,
      model,
      finish: data?.candidates?.[0]?.finishReason ?? null,
      usage: data?.usageMetadata ?? {},
    };
  }
  throw new Error(`ai_failed: ${last}`);
}

// ---------------------------------------------------------------------------
// Rows

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function saveClip(id: string, patch: Row) {
  const { error } = await admin.from("room_capture_clips").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`db_update_failed: ${error.message}`);
}

async function saveJob(id: string, patch: Row) {
  const { error } = await admin.from("room_capture_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`db_update_failed: ${error.message}`);
}

/** Take the row for one step; null if another step holds it. */
async function claim(table: "room_capture_clips" | "room_capture_jobs", id: string): Promise<Row | null> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(table)
    .update({ lease_until: new Date(Date.now() + LEASE_MS).toISOString() })
    .eq("id", id)
    .or(`lease_until.is.null,lease_until.lt.${now}`)
    .select("*")
    .maybeSingle();
  if (error) console.error(`claim ${table} ${id}:`, error.message);
  return data ?? null;
}

const leaseFree = (r: Row) => !r.lease_until || new Date(r.lease_until).getTime() < Date.now();

/** Start a fresh invocation for the next step; this one may be near its limit. */
async function chain(body: Row) {
  try {
    const res = await fetch(SELF, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-room-capture-internal": SERVICE_KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`chain ${body.action} -> ${res.status}`);
  } catch (e) {
    console.error(`chain ${body.action} failed:`, e);
  }
}

function background(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error("background step failed:", e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(guarded);
}

async function deleteGeminiFile(name?: string | null) {
  if (!name || !/^files\/[a-z0-9-]+$/.test(name)) return;
  await fetch(`${API}/v1beta/${name}`, { method: "DELETE", headers: { "x-goog-api-key": GEMINI_API_KEY } }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// One clip

/** storage -> Gemini, resumable. True when there is more to do. */
async function transfer(clip: Row): Promise<boolean> {
  const started = Date.now();
  const size = Number(clip.size) || 0;
  if (!size) throw new Error("empty_video");
  let url: string | null = clip.gemini_upload_url ?? null;
  let offset = url ? Number(clip.gemini_offset) || 0 : 0;
  if (!url) {
    const res = await fetch(`${API}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(size),
        "X-Goog-Upload-Header-Content-Type": String(clip.mime_type || "video/mp4"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: `room-capture-${clip.id}` } }),
    });
    url = res.headers.get("X-Goog-Upload-URL");
    if (!res.ok || !url) throw new Error(`upload_start_failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    await saveClip(clip.id, { status: "transferring", gemini_upload_url: url, gemini_offset: 0 });
  }
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(clip.storage_path, 3600);
  if (error || !signed?.signedUrl) throw new Error(`video_missing: ${error?.message ?? "no signed url"}`);

  while (offset < size) {
    if (Date.now() - started > STEP_BUDGET_MS) return true;
    const end = Math.min(size, offset + CHUNK);
    const part = await fetch(signed.signedUrl, { headers: { Range: `bytes=${offset}-${end - 1}` } });
    if (!part.ok) throw new Error(`storage_read_failed ${part.status}`);
    const bytes = new Uint8Array(await part.arrayBuffer());
    if (bytes.length !== end - offset) throw new Error(`storage_read_short ${bytes.length} of ${end - offset}`);
    const last = end === size;
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Goog-Upload-Offset": String(offset), "X-Goog-Upload-Command": last ? "upload, finalize" : "upload" },
      body: bytes,
    });
    if (!res.ok) {
      // Start the Gemini upload over on the next attempt.
      await saveClip(clip.id, { gemini_upload_url: null, gemini_offset: 0 });
      throw new Error(`gemini_upload_failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    offset = end;
    if (last) {
      const f = (await res.json().catch(() => null))?.file;
      if (!f?.name) throw new Error("gemini_upload_no_file");
      await saveClip(clip.id, {
        status: "waiting", gemini_file: f.name, gemini_uri: f.uri ?? null,
        gemini_upload_url: null, gemini_offset: offset, attempts: 0, error: null,
      });
      return true;
    }
    await saveClip(clip.id, { gemini_offset: offset });
  }
  return true;
}

/** Back to the start when Gemini no longer has the file (it keeps them 48 hours). */
async function reupload(clip: Row) {
  await saveClip(clip.id, { status: "uploaded", gemini_file: null, gemini_uri: null, gemini_upload_url: null, gemini_offset: 0 });
}

/** Gemini prepares an uploaded video before it can be used. */
async function waitActive(clip: Row): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < STEP_BUDGET_MS) {
    const res = await fetch(`${API}/v1beta/${clip.gemini_file}`, { headers: { "x-goog-api-key": GEMINI_API_KEY } });
    if (res.status === 404 || res.status === 403) {
      await reupload(clip);
      return true;
    }
    if (!res.ok) throw new Error(`file_status_failed ${res.status}`);
    const f = await res.json();
    if (f.state === "ACTIVE") {
      await saveClip(clip.id, { status: "analyzing", gemini_uri: f.uri, mime_type: f.mimeType || clip.mime_type, attempts: 0, error: null });
      return true;
    }
    if (f.state === "FAILED") {
      await saveClip(clip.id, { status: "failed", error: "Gemini could not read this video." });
      return false;
    }
    await sleep(5000);
  }
  return true;
}

async function analyze(clip: Row): Promise<boolean> {
  const check = await fetch(`${API}/v1beta/${clip.gemini_file}`, { headers: { "x-goog-api-key": GEMINI_API_KEY } });
  if (check.status === 404 || check.status === 403) {
    await reupload(clip);
    return true;
  }
  const { data: job } = await admin.from("room_capture_jobs").select("room_name, sale_context").eq("id", clip.job_id).maybeSingle();
  const context = job?.sale_context ? `Sale: ${String(job.sale_context).slice(0, 200)}.` : "";
  const out = await gemini(
    [
      { file_data: { mime_type: String(clip.mime_type || "video/mp4"), file_uri: clip.gemini_uri } },
      { text: ANALYZE_PROMPT(String(job?.room_name || "").slice(0, 80), context) },
    ],
    65536,
  );
  const r = out.result as Row;
  const items = (Array.isArray(r.items) ? r.items : []).filter((i: Row) => i && typeof i.id === "number");
  const transcript = Array.isArray(r.transcript)
    ? r.transcript.map((s: Row) => s?.text || "").join(" ")
    : String(r.transcript || "");
  await saveClip(clip.id, {
    status: "done",
    result: { summary: String(r.clip_summary || ""), transcript: transcript.trim(), items, model: out.model, finish: out.finish },
    attempts: 0,
    error: null,
  });
  return false;
}

async function runClip(id: string) {
  const clip = await claim("room_capture_clips", id);
  if (!clip) return;
  let more = false;
  try {
    if (clip.status === "uploaded" || clip.status === "transferring") more = await transfer(clip);
    else if (clip.status === "waiting") more = await waitActive(clip);
    else if (clip.status === "analyzing") more = await analyze(clip);
    await saveClip(id, { lease_until: null });
  } catch (e) {
    const attempts = (Number(clip.attempts) || 0) + 1;
    console.error(`clip ${id} (${clip.status}) attempt ${attempts}:`, e);
    if (attempts >= MAX_ATTEMPTS) {
      await saveClip(id, { status: "failed", error: errText(e), attempts, lease_until: null });
    } else {
      await saveClip(id, { error: errText(e), attempts, lease_until: null });
      await sleep(5000 * attempts);
      more = true;
    }
  }
  if (more) await chain({ action: "step", clipId: id });
  else await checkJob(clip.job_id);
}

// ---------------------------------------------------------------------------
// The room

/** Once the room is finished and every clip is through, merge it. */
async function checkJob(jobId: string) {
  const { data: job } = await admin.from("room_capture_jobs").select("id, status").eq("id", jobId).maybeSingle();
  if (!job || job.status !== "processing") return;
  const { data: clips } = await admin.from("room_capture_clips").select("status").eq("job_id", jobId);
  if (!clips?.length) {
    await saveJob(jobId, { status: "failed", error: "No clips were recorded for this room." });
    return;
  }
  if (clips.some((c) => c.status !== "done" && c.status !== "failed")) return;
  const { data: moved } = await admin
    .from("room_capture_jobs")
    .update({ status: "consolidating", lease_until: null, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "processing")
    .select("id")
    .maybeSingle();
  if (moved) await chain({ action: "consolidate", jobId });
}

const spoken = (s: unknown) => (Array.isArray(s) ? s : s ? [s] : []).map(String).filter(Boolean);
const signPosition = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null;
};

async function runConsolidate(jobId: string) {
  const job = await claim("room_capture_jobs", jobId);
  if (!job || job.status !== "consolidating") {
    if (job) await saveJob(jobId, { lease_until: null });
    return;
  }
  const { data: rows } = await admin
    .from("room_capture_clips")
    .select("id, seq, file_name, status, gemini_file, gemini_uri, mime_type, result")
    .eq("job_id", jobId)
    .order("seq");
  const clips = rows ?? [];
  const done = clips.filter((c) => c.status === "done" && c.result);
  try {
    if (!done.length) {
      await saveJob(jobId, { status: "failed", error: "No clip could be analysed.", lease_until: null });
      return;
    }
    const clipIds = done.map((c) => c.id);
    let lots: unknown[] | null = null;
    let note: string | null = null;
    if (done.length > 1) {
      const listing: string[] = [];
      done.forEach((c, k) => {
        listing.push(`\n== Clip V${k + 1} (${c.file_name}) narration: ${c.result.transcript ?? ""}\nItems:`);
        for (const it of c.result.items ?? []) {
          listing.push(
            `V${k + 1}-${it.id}: ${it.name} | ${it.description ?? ""} | wall: ${it.wall ?? ""} | group: ${it.group_name ?? ""} | said: ${spoken(it.spoken_facts).join("; ")} | $${it.estate_price ?? 0} | qty ${it.quantity ?? 1} | pos: ${signPosition(it.position) ?? ""} | @${it.timestamp ?? ""}${it.not_for_sale ? " | NFS" : ""}`,
          );
        }
      });
      const videos: unknown[] = [];
      done.forEach((c, k) => {
        if (c.gemini_uri) {
          videos.push({ text: `Clip V${k + 1}:` });
          videos.push({ file_data: { mime_type: String(c.mime_type || "video/mp4"), file_uri: c.gemini_uri } });
        }
      });
      const attempt = async (withVideo: boolean) => {
        const out = await gemini(
          [{ text: `${CONSOLIDATE_PROMPT(withVideo)}\n\nITEM LIST:\n${listing.join("\n")}` }, ...(withVideo ? videos : [])],
          65536,
        );
        const l = (out.result as Row).lots;
        if (!Array.isArray(l)) throw new Error("merge_returned_no_lots");
        return l;
      };
      try {
        lots = await attempt(videos.length > 0);
      } catch (e) {
        console.error(`consolidate ${jobId} with video:`, e);
        try {
          lots = await attempt(false);
        } catch (e2) {
          // Review still works: every item comes through as its own lot.
          note = `The clips could not be merged automatically (${errText(e2)}); look for items that appear twice.`;
        }
      }
    }
    await saveJob(jobId, { status: "ready", merged: { clipIds, lots }, error: note, lease_until: null });
    for (const c of clips) await deleteGeminiFile(c.gemini_file);
    await admin.from("room_capture_clips").update({ gemini_file: null, gemini_uri: null }).eq("job_id", jobId);
  } catch (e) {
    console.error(`consolidate ${jobId}:`, e);
    await saveJob(jobId, { error: errText(e), lease_until: null });
  }
}

// ---------------------------------------------------------------------------
// User actions

/** The job, if the caller belongs to its company. */
async function jobFor(userId: string, jobId: string): Promise<Row | null> {
  if (!jobId) return null;
  const { data: job } = await admin.from("room_capture_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return null;
  const { data: own } = await admin.from("companies").select("id").eq("id", job.company_id).eq("user_id", userId).limit(1);
  if (own?.length) return job;
  const { data: mem } = await admin.from("user_companies").select("company_id").eq("company_id", job.company_id).eq("user_id", userId).limit(1);
  return mem?.length ? job : null;
}

const RUNNABLE = ["uploaded", "transferring", "waiting", "analyzing"];

async function kick(job: Row) {
  const { data: clips } = await admin.from("room_capture_clips").select("id, status, lease_until").eq("job_id", job.id);
  for (const c of clips ?? []) {
    if (RUNNABLE.includes(c.status) && leaseFree(c)) await chain({ action: "step", clipId: c.id });
  }
  if (job.status === "processing") await checkJob(job.id);
  else if (job.status === "consolidating" && leaseFree(job)) await chain({ action: "consolidate", jobId: job.id });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "step" || action === "consolidate") {
      if (!SERVICE_KEY || req.headers.get("x-room-capture-internal") !== SERVICE_KEY) return json({ error: "forbidden" }, 403);
      background(action === "step" ? runClip(String(body.clipId || "")) : runConsolidate(String(body.jobId || "")));
      return json({ accepted: true }, 202);
    }

    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(DB_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supa.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!user) return json({ error: "not_authenticated" }, 401);
    if (!GEMINI_API_KEY) return json({ error: "ai_not_configured" }, 500);

    if (action === "kick" || action === "finish_job" || action === "cleanup_job") {
      const job = await jobFor(user.id, String(body.jobId || ""));
      if (!job) return json({ error: "job_not_found" }, 404);

      if (action === "finish_job") {
        if (job.status === "recording") {
          await saveJob(job.id, { status: "processing", finished_at: new Date().toISOString() });
          job.status = "processing";
        }
        background(kick(job));
        return json({ ok: true });
      }

      if (action === "cleanup_job") {
        const { data: clips } = await admin.from("room_capture_clips").select("storage_path, gemini_file").eq("job_id", job.id);
        const paths = (clips ?? []).map((c) => c.storage_path).filter(Boolean);
        if (paths.length) {
          const { error } = await admin.storage.from(BUCKET).remove(paths);
          if (error) console.error(`cleanup ${job.id} storage:`, error.message);
        }
        for (const c of clips ?? []) await deleteGeminiFile(c.gemini_file);
        if (body.discard) {
          await admin.from("room_capture_jobs").delete().eq("id", job.id);
        } else {
          await saveJob(job.id, { status: "imported", imported_at: new Date().toISOString() });
        }
        return json({ ok: true });
      }

      background(kick(job));
      return json({ ok: true });
    }

    if (action === "retry_clip") {
      const { data: clip } = await admin.from("room_capture_clips").select("id, job_id, status, gemini_file").eq("id", String(body.clipId || "")).maybeSingle();
      const job = clip ? await jobFor(user.id, clip.job_id) : null;
      if (!clip || !job) return json({ error: "clip_not_found" }, 404);
      if (clip.status !== "failed") return json({ ok: true });
      await saveClip(clip.id, { status: clip.gemini_file ? "waiting" : "uploaded", attempts: 0, error: null, lease_until: null });
      if (job.finished_at && (job.status === "ready" || job.status === "failed")) {
        await saveJob(job.id, { status: "processing", merged: null, error: null });
      }
      background(chain({ action: "step", clipId: clip.id }));
      return json({ ok: true });
    }

    if (action === "refine") {
      const frames: { id: number; name: string; data: string }[] = (Array.isArray(body.frames) ? body.frames : [])
        .filter((f: { id?: unknown; data?: unknown }) => f && typeof f.id === "number" && typeof f.data === "string")
        .slice(0, 40);
      if (!frames.length) return json({ error: "no_frames" }, 400);
      const parts: unknown[] = [{
        text: `Each image below is a video frame from a house walkthrough, labelled with an item id and the item's name.
For each frame, find THAT item and return a tight box around the whole item (for a pair or set, just the one
member most central in the frame). If the item is not visible in the frame, return null for its box.
box_2d = [ymin, xmin, ymax, xmax] normalized 0-1000.
Return JSON only: {"boxes":[{"id":1,"box_2d":[0,0,0,0]}]}`,
      }];
      for (const f of frames) {
        parts.push({ text: `Item ${f.id}: ${String(f.name || "").slice(0, 120)}` });
        parts.push({ inline_data: { mime_type: "image/jpeg", data: f.data } });
      }
      const out = await gemini(parts, 16384);
      return json(out);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
