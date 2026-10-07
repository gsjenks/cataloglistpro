// supabase/functions/room-capture/index.ts
// Room capture from narrated walkthrough videos (docs/room-capture-spec.md).
//
//   start_upload  -> a Gemini resumable-upload session URL. The browser sends the
//                    video straight to Google in 8 MiB chunks; the session URL
//                    authorises that one upload, so the API key never leaves here
//                    and the video never passes through this function.
//   find_file     -> the uploaded file, looked up by the unique display name given
//                    at start_upload. Google's reply to the final upload chunk has
//                    no CORS headers, so the browser can't read the file name from it.
//   file_status   -> the uploaded file's state (PROCESSING / ACTIVE / FAILED).
//   analyze       -> one clip: transcript plus every sellable item, with the
//                    timestamp and box of its clearest view.
//   refine        -> each item's chosen video frame, as a still, -> a tight box.
//                    Boxes from the video pass are often loose or offset (the model
//                    samples ~1 frame a second); on a still they are accurate.
//   consolidate   -> all clips of one room (rows + crop thumbnails) -> one lot list:
//                    the same item seen in several clips merged, pairs split across
//                    walls joined, "validation only" clips honoured.
//   delete_file   -> remove the uploaded video from Gemini once analysed.
//
// Secrets: DB_URL, DB_SERVICE_KEY (only used to verify the caller), GEMINI_API_KEY.
// Optional: ROOM_CAPTURE_MODEL (default gemini-3.8-flash; falls back to
// gemini-2.5-flash if the key can't use it).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://generativelanguage.googleapis.com";
const DB_URL = Deno.env.get("DB_URL")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODELS = [...new Set([Deno.env.get("ROOM_CAPTURE_MODEL") || "gemini-3.8-flash", "gemini-2.5-flash"])];
const MAX_THUMBS = 400;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

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
- POSITION SIGNS: the room has printed paper signs placed around it, reading like "MR 1 - 02" or "MR01-02"
  (two room letters, the room number, a dash, then a POSITION number 1-20), sometimes with the company and
  room name in small print. position = the integer after the dash on the sign nearest the item: the sign
  on the same surface, or the sign shown for that stretch of wall. position_sign = the sign text exactly as
  read. If no sign is legible near the item, both are null. Never guess a number you cannot read; never
  invent signs. Signs themselves are not items.
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

const CONSOLIDATE_PROMPT = `These are all the items found in several narrated walkthrough clips of ONE room,
listed per clip with that clip's narration. Each item has an id like V3-12, and most have a crop image
(sent after the list, each labelled with its id).

The clips overlap: the same physical item can appear in more than one clip. The narrator may say where
pairs are split across the room ("its pair is on the other side of the room") and that some clips are only
for checking ("not to be duplicated, just for validation").

Produce the final LOT LIST for the room:
- Merge rows that are the same physical object into one lot (use the crops, names and narration).
- A clip the narrator says is for validation only contributes no new lots, unless it shows something no
  other clip has; then keep it.
- Join pair/set members found in different clips into one lot (a pair = ONE lot, quantity 2) when the
  narration or matching descriptions say they belong together.
- Keep everything else as its own lot. Do not drop personal/not-for-sale rows; keep their flag.
- For each lot give the best name, the best crop (the member id with the clearest view), a price for the
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(DB_URL, Deno.env.get("DB_SERVICE_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);
    if (!GEMINI_API_KEY) return json({ error: "ai_not_configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "start_upload") {
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) return json({ error: "bad_size" }, 400);
      const res = await fetch(`${API}/upload/v1beta/files`, {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(size),
          "X-Goog-Upload-Header-Content-Type": String(body.mimeType || "video/mp4"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: String(body.displayName || body.fileName || "room-capture").slice(0, 100) } }),
      });
      const uploadUrl = res.headers.get("X-Goog-Upload-URL");
      if (!res.ok || !uploadUrl) {
        return json({ error: `upload_start_failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` }, 502);
      }
      // Gemini requires every chunk but the last to be a multiple of 8 MiB.
      return json({ uploadUrl, chunkSize: 8 * 1024 * 1024 });
    }

    if (action === "find_file") {
      const displayName = String(body.displayName || "");
      if (!displayName) return json({ error: "bad_display_name" }, 400);
      let pageToken = "";
      for (let page = 0; page < 5; page++) {
        const res = await fetch(
          `${API}/v1beta/files?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
          { headers: { "x-goog-api-key": GEMINI_API_KEY } },
        );
        if (!res.ok) return json({ error: `find_file_failed ${res.status}` }, 502);
        const d = await res.json();
        const f = (d.files ?? []).find((x: { displayName?: string }) => x.displayName === displayName);
        if (f) return json({ name: f.name, state: f.state, uri: f.uri, mimeType: f.mimeType });
        if (!d.nextPageToken) break;
        pageToken = d.nextPageToken;
      }
      return json({ name: null });
    }

    if (action === "file_status" || action === "delete_file") {
      const name = String(body.name || "");
      if (!/^files\/[a-z0-9-]+$/.test(name)) return json({ error: "bad_name" }, 400);
      const res = await fetch(`${API}/v1beta/${name}`, {
        method: action === "delete_file" ? "DELETE" : "GET",
        headers: { "x-goog-api-key": GEMINI_API_KEY },
      });
      if (action === "delete_file") return json({ ok: res.ok });
      if (!res.ok) return json({ error: `file_status_failed ${res.status}` }, 502);
      const f = await res.json();
      return json({ state: f.state, uri: f.uri, mimeType: f.mimeType, error: f.error ?? null });
    }

    if (action === "analyze") {
      const uri = String(body.uri || "");
      if (!uri.startsWith(`${API}/`)) return json({ error: "bad_uri" }, 400);
      const context = body.saleContext ? `Sale: ${String(body.saleContext).slice(0, 200)}.` : "";
      const out = await gemini(
        [
          { file_data: { mime_type: String(body.mimeType || "video/mp4"), file_uri: uri } },
          { text: ANALYZE_PROMPT(String(body.room || "").slice(0, 80), context) },
        ],
        65536,
      );
      return json(out);
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

    if (action === "consolidate") {
      const listing = String(body.listing || "");
      if (!listing) return json({ error: "no_items" }, 400);
      const thumbs: { id: string; data: string }[] = (Array.isArray(body.thumbs) ? body.thumbs : [])
        .filter((t: { id?: string; data?: string }) => t && typeof t.id === "string" && typeof t.data === "string")
        .slice(0, MAX_THUMBS);
      const parts: unknown[] = [{ text: `${CONSOLIDATE_PROMPT}\n\nITEM LIST:\n${listing}\n\nCROPS FOLLOW, each labelled with its id:` }];
      for (const t of thumbs) {
        parts.push({ text: t.id });
        parts.push({ inline_data: { mime_type: "image/jpeg", data: t.data } });
      }
      const out = await gemini(parts, 65536);
      return json(out);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
