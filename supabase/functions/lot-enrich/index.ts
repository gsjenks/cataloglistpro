// supabase/functions/lot-enrich/index.ts
// AI Detail Editor for a lot. Two Gemini calls, because Google Search grounding
// cannot be combined with a JSON response in one request:
//   1. RESEARCH — photos + the cataloger's details, with the google_search tool on:
//      identify the item, the maker/material, and recent comparable sales.
//   2. FORMAT — photos + those research notes -> the form's JSON fields.
// If the research call fails the format call still runs on the photos alone, and
// the response says so (`researched: false`). The Gemini key stays server-side.
//
// Secrets: DB_URL, DB_SERVICE_KEY (only used to verify the caller), GEMINI_API_KEY.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DB_URL = Deno.env.get("DB_URL")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = "gemini-2.5-flash";
const MAX_PHOTOS = 3;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface PhotoIn { data: string; mimeType?: string }
interface Lists { categories?: string[]; styles?: string[]; origins?: string[]; creators?: string[]; materials?: string[] }
interface Source { title: string; uri: string }

function gemini(body: unknown) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

function textOf(data: any): string {
  return (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text)
    .filter(Boolean)
    .join("");
}

function catalogerBlock(corrected: string[], entered: string[]): string {
  if (!corrected.length && !entered.length) return "";
  return [
    "The cataloger has handled this item in person.",
    corrected.length
      ? "These details were ENTERED OR CORRECTED BY THE CATALOGER and are authoritative — they override anything inferred from the photos, including an earlier description:\n" +
        corrected.join("\n")
      : "",
    entered.length
      ? "Other details currently on file (keep unless the corrected details or photos contradict them):\n" +
        entered.join("\n")
      : "",
  ].filter(Boolean).join("\n");
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
    const photos: PhotoIn[] = (Array.isArray(body.photos) ? body.photos : [])
      .filter((p: PhotoIn) => p && typeof p.data === "string" && p.data)
      .slice(0, MAX_PHOTOS);
    if (!photos.length) return json({ error: "no_photos" }, 400);

    const corrected: string[] = Array.isArray(body.corrected) ? body.corrected.map(String) : [];
    const entered: string[] = Array.isArray(body.entered) ? body.entered.map(String) : [];
    const lists: Lists = body.lists ?? {};
    const context = catalogerBlock(corrected, entered);

    const imageParts = photos.map((p) => ({
      inline_data: { mime_type: p.mimeType || "image/jpeg", data: p.data },
    }));

    // ---- 1. Research (grounded in Google Search) ----
    let research = "";
    let sources: Source[] = [];
    let queries: string[] = [];
    let researched = false;
    try {
      const researchPrompt = [
        "You are a senior appraiser researching an item for an auction/estate-sale catalog.",
        "Use Google Search. Work out what this item is, then find:",
        "- the maker/manufacturer/artist and how to recognise their work (marks, signatures, patterns);",
        "- the materials and the period/date of manufacture;",
        "- RECENT COMPARABLE SALES (last ~5 years) of the same or closely similar items: venue, date, hammer/sold price, and how each compares (size, condition, variant);",
        "- anything that moves value up or down (rarity, condition issues, reproductions to watch for).",
        "Write concise research notes in plain text. Cite concrete prices. If you cannot find reliable comparables, say so plainly rather than guessing.",
        context,
      ].filter(Boolean).join("\n\n");

      const res = await gemini({
        contents: [{ parts: [{ text: researchPrompt }, ...imageParts] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 2048 } },
      });
      if (res.ok) {
        const data = await res.json();
        research = textOf(data).trim();
        const meta = data?.candidates?.[0]?.groundingMetadata ?? {};
        const seen = new Set<string>();
        sources = (meta.groundingChunks ?? [])
          .map((c: any) => c?.web)
          .filter((w: any) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
          .map((w: any) => ({ title: String(w.title || w.uri), uri: String(w.uri) }))
          .slice(0, 12);
        queries = (meta.webSearchQueries ?? []).map(String);
        researched = !!research;
      } else {
        console.error("Research call failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      }
    } catch (e) {
      console.error("Research call threw", e);
    }

    // ---- 2. Format into the form's fields ----
    const pick = (arr: string[] | undefined, n: number) => (arr ?? []).slice(0, n).join(", ");
    const formatPrompt = [
      "You are an auction cataloger. Respond with ONLY valid JSON (no markdown, no commentary). Use this exact schema, where every value is a STRING or NUMBER (never an array):",
      '{"title": string under 50 chars, "description": string, "category": string, "style": string, "origin": string, "creator": string, "materials": string, "condition": string, "estimate_low": number, "estimate_high": number, "starting_bid": number, "valuation_basis": string}',
      `Use valid dropdown values where they fit: CATEGORIES: ${pick(lists.categories, 30)}. STYLES: ${pick(lists.styles, 25)}. ORIGINS: ${pick(lists.origins, 25)}. CREATORS: ${pick(lists.creators, 20)}. MATERIALS: ${pick(lists.materials, 25)}. If the maker or material is not in these lists, use the correct name as-is.`,
      "The description should read like a catalog entry: what it is, maker/attribution, materials, period, notable features, marks, and dimensions if known. Do not mention prices or sources in it.",
      "estimate_low/estimate_high/starting_bid are US dollars. Base them on the comparable sales in the research notes when there are any. valuation_basis: one or two sentences saying which comparables (or what reasoning) the estimate rests on.",
      context,
      researched
        ? `=== RESEARCH NOTES ===\n${research}`
        : "No web research is available for this run; rely on the photos and the cataloger's details, and say so in valuation_basis.",
    ].filter(Boolean).join("\n\n");

    const fmt = await gemini({
      contents: [{ parts: [{ text: formatPrompt }, ...imageParts] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
      },
    });
    if (!fmt.ok) {
      const detail = await fmt.text().catch(() => "");
      console.error("Format call failed", fmt.status, detail.slice(0, 300));
      return json({ error: `ai_failed ${fmt.status}` }, 502);
    }
    const text = textOf(await fmt.json());
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: "unparseable_ai_response", raw: text.slice(0, 300) }, 502);
      fields = JSON.parse(m[0]);
    }

    return json({ fields, research, sources, queries, researched });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
