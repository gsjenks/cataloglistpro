// supabase/functions/help-assistant/index.ts
// Tier 1 in-app help assistant. Answers how-to questions about CatalogListPro,
// grounded in a built-in knowledge base. The Gemini key stays server-side.
//
// Built on Gemini's tool-calling request shape (tools: [] for now) so Tier 2 —
// live data lookups — is purely additive: register functionDeclarations below and
// add a tool-execution loop. Tier 1 answers how-tos only; it cannot see live data.
//
// Secrets: DB_URL, DB_SERVICE_KEY (only used to verify the caller), GEMINI_API_KEY.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DB_URL = Deno.env.get("DB_URL")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = "gemini-2.5-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const KNOWLEDGE = `
CatalogListPro is a web app for auction houses that runs two kinds of sale:
(1) an in-person ESTATE SALE, and (2) a consignment AUCTION sold through
LiveAuctioneers (bidding happens on LiveAuctioneers; the app runs everything
around it). Item = a "lot". For estate sales the starting bid IS the price
(no bidding). Every lot is Available, Held, or Sold.

ESTATE SALE — how to:
- Catalog items: on the Items tab. Add photos, set a PRIMARY photo (it's the main
  image everywhere and image #1 in exports). The starting bid is the price.
- Mark inventory: on the Sale page, set a lot Available / Held / Sold anytime.
- Baskets tool (two tabs: Shopper Baskets, Item Lookup):
  * Find a shopper: search any part of name / email / last 4 of phone (typo-tolerant),
    or scan their basket QR. The "Open baskets" list shows everyone currently holding items.
  * New walk-up shopper: "+ New shopper" (name + phone/email, no code).
  * Hold an item: open the shopper -> "Add / hold an item" -> search the sale -> tap it.
    Or "+ New item" to price a loose/uncatalogued item on the spot. Holds run a
    30-minute timer that refreshes while the shopper is active.
  * Merge/Delete a customer: open them -> Merge (folds into another, items move) or
    Delete (removes a stray, releases its items).
  * Item Lookup: search any lot to see its status and who holds/bought it.
- Register (checkout): find the customer (type name/phone/email, or scan basket QR;
  a typed name creates a basket on the first item). Add items via Scan Tag, Add Item,
  or "Add new item" with a price. Check "For delivery" per item and Save the mover
  details (needs a date + a contact). Set Tax %, pick a tender (Cash, Check, Venmo,
  Cash App, Other; Card coming soon), Complete Sale -> receipt. "Switch customer"
  clears the register for the next person; the prior shopper's holds stay held.

AUCTION (LiveAuctioneers) — how to. Stages: Intake -> Setup -> Listed -> Live ->
Settlement -> Fulfillment -> Reconciliation -> Closed (a stage banner gates each step).
- Intake & consign: add the consignor (Contacts); upload the signed contract on the
  Documents tab, type = Contract (shows "Contract on file"). In Consignments (Setup),
  set commission %, buyer's premium %, fees, buy-in.
- Catalog lots: Items tab; auto lot numbers; primary photo; optional AI Enrich.
- Export to LiveAuctioneers: Reports & Tools -> LiveAuctioneers Export (CSV, or CSV +
  photo ZIP). Fix anything the export check flags, then upload the files to LA yourself
  (there is NO automatic LA connection).
- Import results: Dashboard -> EOA Import (XML) creates the sale, buyers, and unpaid
  lots with a 72-hour clock (use this). The xlsx path only writes hammer prices.
- Buyer invoices: Payments tab -> import LA's buyer-invoice PDF (source of truth for
  tax + shipping).
- Payments (Settlement): on the Payments tab, per lot: Paid / Mark all paid;
  Offer 2nd bidder (non-payer -> underbidder, becomes a house sale); Default (drops to
  Unsold); Refund (paid lot returned to Unsold). Invoice builds a PDF; Email opens a
  pre-filled Gmail — attach the saved PDF and send.
- House charges & tax: add per-buyer house shipping/handling/tax; house-collected sales
  tax is a liability to remit, not revenue. Resale certificates: Fulfillment -> Resale
  certificates (photo the cert + permit/expiry; a valid cert auto-exempts).
- Fulfillment: group paid lots by buyer; assign a handoff (a shipper, or Pickup / Store
  hold); add carrier + tracking; mark shipped -> delivered (or picked up). Print Avery
  labels, packing list, per-buyer invoices, per-shipper manifest. On a shipper's
  manifest, "Shipper picked up — mark all shipped" flips the whole load shipped at once.
- Reconciliation: money summary (house revenue vs money held for others); pay each
  consignor (check/ACH/wire) with a reference; print statements; export the Accounting CSV.
- Unsold: Aftersale a passed lot, or dispose (return / hold-relist / charity / discard).
- Close: advance to Closed (status -> completed). Archive is a manual checkbox today;
  keep the Accounting CSV and statements as the record.

ADMIN: Settings -> Team (invite by email; reset password). Settings -> Delete Business
(owner only, double confirm). Sales list -> delete a sale (removes all its data + files).
Company switcher in the header. Settings -> upload a company logo.
TROUBLESHOOTING: a stale screen or missing button -> hard refresh (Ctrl+Shift+R /
Cmd+Shift+R). Holds expire after 30 min idle and return to Available.
`.trim();

function systemPrompt(screen?: string): string {
  return [
    "You are the in-app help assistant for CatalogListPro, helping auction-house staff.",
    "Answer ONLY from the knowledge below. Be concise and practical: give the steps and",
    "name the exact screen/tab and button (in the app's own wording). Prefer a short",
    "numbered list for multi-step answers. If the question isn't covered, say you're not",
    "sure and suggest where they might look — do not invent features.",
    "You cannot see the user's live data yet (no balances, no specific buyers/lots), so if",
    "asked about specific records, say you can't look that up yet and explain where in the",
    "app they can see it themselves.",
    screen ? `The user is currently on: ${screen}.` : "",
    "",
    "=== KNOWLEDGE ===",
    KNOWLEDGE,
  ].filter(Boolean).join("\n");
}

interface Msg { role: "user" | "assistant"; text: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Gate to signed-in users (cost control + Tier 2 will scope data to them).
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(DB_URL, Deno.env.get("DB_SERVICE_KEY") ?? "", {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    if (!GEMINI_API_KEY) return json({ error: "assistant_not_configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const messages: Msg[] = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (!messages.length) return json({ error: "no message" }, 400);

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.text ?? "") }],
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt(body.screen) }] },
          contents,
          tools: [], // Tier 2: add functionDeclarations here + a tool-execution loop.
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Gemini error", res.status, detail.slice(0, 300));
      return json({ error: "assistant_failed" }, 502);
    }
    const data = await res.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).filter(Boolean).join("") ||
      "Sorry — I couldn't come up with an answer. Try rephrasing.";
    return json({ reply });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
