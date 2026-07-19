// supabase/functions/social-webhook/index.ts
// Meta (Facebook / Instagram) webhook receiver for the Social Media Sales Stream.
//
//   GET  -> webhook verification handshake (returns hub.challenge)
//   POST -> comment events. We verify Meta's signature, match each comment to a
//           lot in the associated stream, place a 30-min hold, and record a
//           `social_claims` row. Delivering the checkout link (Private Replies)
//           happens in a later phase — Phase 1 only ingests + holds.
//
// Secrets (set with `supabase secrets set`):
//   DB_URL, DB_SERVICE_KEY   – already set (shared with other functions)
//   META_VERIFY_TOKEN        – any random string; must match the value you type
//                              into the Meta App Dashboard webhook config
//   META_APP_SECRET          – your Meta app secret (used to verify X-Hub-Signature-256)
//
// Meta requires a fast 2xx or it retries and eventually disables the webhook, so
// we keep the request path lean and always answer 200 on POST (errors are logged
// and recorded, not surfaced to Meta).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("DB_URL")!;
const SERVICE_KEY = Deno.env.get("DB_SERVICE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

const HOLD_MINUTES = 30; // mirrors the estate-sale basket hold window

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---- signature verification ------------------------------------------------
// Meta signs the raw request body with the app secret: header is
// `x-hub-signature-256: sha256=<hex hmac>`. We must hash the EXACT raw bytes.
async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) {
    console.warn("META_APP_SECRET not set — skipping signature check (dev only)");
    return true;
  }
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = header.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actual = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time-ish compare.
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ---- comment parsing -------------------------------------------------------
// A normalized comment extracted from either the Facebook `feed` or Instagram
// `comments` webhook shapes.
interface IncomingComment {
  accountId: string;   // Page id (FB) / IG business account id — routes to a connection
  commentId: string;
  mediaId?: string;    // post_id / media id — routes to a stream
  text: string;
  fromId?: string;
  fromName?: string;
}

// Pull comment events out of a Meta webhook payload. Handles the two shapes we
// subscribe to; anything else yields no comments.
function extractComments(body: any): IncomingComment[] {
  const out: IncomingComment[] = [];
  const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const accountId = String(entry?.id ?? "");
    const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const v = ch?.value ?? {};
      // FB `feed`: item='comment', verb='add'. IG comments: has an `id` + `text`.
      // Instagram's field name varies by API flavor: the classic Graph API sends
      // `comments`, while the newer permission-scoped subscriptions (App Dashboard
      // "use cases") send `instagram_manage_comments`. Accept both, plus live.
      const IG_COMMENT_FIELDS = ["comments", "instagram_manage_comments", "live_comments"];
      const isFbComment = v.item === "comment" && (v.verb === "add" || v.verb === undefined);
      const isIgComment = IG_COMMENT_FIELDS.includes(ch.field) && (v.id || v.text !== undefined);
      if (!isFbComment && !isIgComment) continue;

      const commentId = String(v.comment_id ?? v.id ?? "");
      if (!commentId) continue;
      out.push({
        accountId,
        commentId,
        mediaId: v.post_id ?? v.media?.id ?? v.parent_id ?? undefined,
        text: String(v.message ?? v.text ?? ""),
        fromId: v.from?.id,
        fromName: v.from?.name ?? v.from?.username,
      });
    }
  }
  return out;
}

// Extract a lot-number token from the comment. Keyword is optional: "SOLD 12",
// "sold #12", "mine 12", or a bare "12" all yield "12". Returns null if no
// numeric token is present.
function parseLotToken(text: string): string | null {
  const m = text.match(/#?\s*(\d{1,6})\b/);
  return m ? m[1] : null;
}

// ---- ingestion -------------------------------------------------------------
async function handleComment(c: IncomingComment): Promise<void> {
  // 1) Route account id -> connection -> company.
  const { data: conn } = await supabase
    .from("social_connections")
    .select("id, company_id, platform")
    .eq("external_account_id", c.accountId)
    .maybeSingle();
  if (!conn) {
    console.log(`no connection for account ${c.accountId}; ignoring comment ${c.commentId}`);
    return;
  }

  // 2) Route to a stream: prefer the stream for this media, else the company's
  //    currently-live stream on this platform.
  let stream: any = null;
  if (c.mediaId) {
    const { data } = await supabase
      .from("social_streams")
      .select("id, sale_id, company_id, claim_keyword, status")
      .eq("external_media_id", c.mediaId)
      .maybeSingle();
    stream = data ?? null;
  }
  if (!stream) {
    const { data } = await supabase
      .from("social_streams")
      .select("id, sale_id, company_id, claim_keyword, status")
      .eq("company_id", conn.company_id)
      .eq("platform", conn.platform)
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    stream = data ?? null;
  }

  const token = parseLotToken(c.text);

  // 3) Record the claim first (idempotent). We insert even when we can't match a
  //    lot, so staff can see every attempt in the Live Sale console (Phase 4).
  const base = {
    stream_id: stream?.id ?? null,
    sale_id: stream?.sale_id ?? null,
    company_id: conn.company_id,
    platform: conn.platform,
    external_comment_id: c.commentId,
    commenter_external_id: c.fromId ?? null,
    commenter_name: c.fromName ?? null,
    comment_text: c.text,
    matched_token: token,
  };

  if (!stream) {
    await insertClaim({ ...base, status: "failed", note: "no active stream for this media/company" });
    return;
  }
  if (!token) {
    await insertClaim({ ...base, status: "failed", note: "no lot number found in comment" });
    return;
  }

  // 4) Match the token to a lot in this sale by lot_number.
  const { data: lot } = await supabase
    .from("lots")
    .select("id, inventory_status, held_by, held_until")
    .eq("sale_id", stream.sale_id)
    .eq("lot_number", token)
    .maybeSingle();
  if (!lot) {
    await insertClaim({ ...base, lot_id: null, status: "failed", note: `no lot #${token} in this sale` });
    return;
  }

  // 5) Availability check (respect live, unexpired holds by a different claim).
  const now = Date.now();
  const heldByOther =
    lot.inventory_status === "held" &&
    lot.held_until && new Date(lot.held_until).getTime() > now;
  if (lot.inventory_status === "sold") {
    await insertClaim({ ...base, lot_id: lot.id, status: "failed", note: "already sold" });
    return;
  }
  if (heldByOther) {
    await insertClaim({ ...base, lot_id: lot.id, status: "failed", note: "already claimed/held" });
    return;
  }

  // 6) Insert the claim as held, then place the hold on the lot. The basket id
  //    is the claim id so a later checkout can reconcile the hold to the claim.
  const holdBasketId = `social:${c.commentId}`;
  const claim = await insertClaim({
    ...base,
    lot_id: lot.id,
    status: "held",
    hold_basket_id: holdBasketId,
  });
  if (!claim) return; // conflict — another delivery already handled this comment

  const heldUntil = new Date(now + HOLD_MINUTES * 60 * 1000).toISOString();
  const { error: holdErr } = await supabase
    .from("lots")
    .update({
      inventory_status: "held",
      held_by: holdBasketId,
      held_until: heldUntil,
      updated_at: new Date(now).toISOString(),
    })
    .eq("id", lot.id)
    // Only grab it if still free — guards a race between two simultaneous claims.
    .or(`inventory_status.eq.available,held_until.lt.${new Date(now).toISOString()}`);
  if (holdErr) {
    await supabase.from("social_claims")
      .update({ status: "failed", note: `hold failed: ${holdErr.message}` })
      .eq("id", claim.id);
  }
}

async function insertClaim(row: Record<string, unknown>): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("social_claims")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    // 23505 = unique violation on (platform, external_comment_id) => duplicate delivery.
    if ((error as any).code !== "23505") console.error("insertClaim error", error);
    return null;
  }
  return data;
}

// ---- HTTP ------------------------------------------------------------------
serve(async (req) => {
  const url = new URL(req.url);

  // Verification handshake.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const ok = await verifySignature(raw, req.headers.get("x-hub-signature-256"));
  if (!ok) {
    console.warn("bad webhook signature");
    return new Response("bad signature", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 }); // malformed — ack so Meta doesn't retry
  }

  // Process comments but never let an error surface to Meta (would trigger retries).
  try {
    const comments = extractComments(body);
    for (const c of comments) {
      try {
        await handleComment(c);
      } catch (err) {
        console.error("handleComment failed", c.commentId, err);
      }
    }
  } catch (err) {
    console.error("webhook processing error", err);
  }

  return new Response("ok", { status: 200 });
});
