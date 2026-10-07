// supabase/functions/address-check/index.ts
// Checks that a US street address exists, for delivery details (basket tool).
// Proxies the US Census Bureau geocoder, which is free and keyless but sends no
// CORS headers, so the browser cannot call it directly.
//
//   POST { address: "12 Main St, Richmond, VA 23220" }
//   ->   { matches: [{ address: "12 MAIN ST, RICHMOND, VA, 23220", lat, lng }] }
//
// No matches means the Census has no such address (or it is new / rural / a PO
// box); the app lets staff keep it anyway.
// Secrets: DB_URL, DB_SERVICE_KEY (only used to verify the caller is signed in).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DB_URL = Deno.env.get("DB_URL")!;
const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supa = createClient(DB_URL, Deno.env.get("DB_SERVICE_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const address = String(body.address ?? "").trim().slice(0, 300);
    if (address.length < 5) return json({ error: "address_required" }, 400);

    const url = `${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return json({ error: "lookup_failed", status: res.status }, 502);
    const data = await res.json();

    const matches = ((data?.result?.addressMatches ?? []) as {
      matchedAddress?: string;
      coordinates?: { x?: number; y?: number };
    }[])
      .slice(0, 5)
      .map((m) => ({ address: m.matchedAddress ?? "", lat: m.coordinates?.y ?? null, lng: m.coordinates?.x ?? null }))
      .filter((m) => m.address);

    return json({ matches });
  } catch (e) {
    return json({ error: "lookup_failed", detail: e instanceof Error ? e.message : String(e) }, 502);
  }
});
