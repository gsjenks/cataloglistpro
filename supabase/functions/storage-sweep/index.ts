// supabase/functions/storage-sweep/index.ts
// One-off maintenance: delete orphaned files from a storage bucket — objects with
// no matching database row. Guarded by SWEEP_SECRET. Defaults to a DRY RUN.
//   body: { bucket: "photos" | "documents", dryRun?: boolean, secret: string }
// Reference sources (a file is KEPT if its path appears in any of these):
//   photos    -> photos.file_path
//   documents -> documents.file_path + tax_exemptions.image_path (resale certs)
// The company logo bucket ("company-assets") is intentionally NOT swept.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DB_URL = Deno.env.get("DB_URL")!;
const DB_SERVICE_KEY = Deno.env.get("DB_SERVICE_KEY")!;
const SWEEP_SECRET = Deno.env.get("SWEEP_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// List every object path in a bucket (folders are entries with id === null).
async function listAll(sb: SupabaseClient, bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, {
      limit: 100, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if ((item as { id: string | null }).id === null) {
        out.push(...(await listAll(sb, bucket, path)));
      } else {
        out.push(path);
      }
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    if (!SWEEP_SECRET || body.secret !== SWEEP_SECRET) return json({ error: "forbidden" }, 403);

    const bucket = body.bucket as string;
    const dryRun = body.dryRun !== false; // default true
    if (bucket !== "photos" && bucket !== "documents") {
      return json({ error: "bucket must be 'photos' or 'documents'" }, 400);
    }

    const sb = createClient(DB_URL, DB_SERVICE_KEY);
    const files = await listAll(sb, bucket);

    const known = new Set<string>();
    if (bucket === "photos") {
      const { data } = await sb.from("photos").select("file_path");
      (data ?? []).forEach((r: { file_path: string | null }) => r.file_path && known.add(r.file_path));
    } else {
      const { data: d } = await sb.from("documents").select("file_path");
      (d ?? []).forEach((r: { file_path: string | null }) => r.file_path && known.add(r.file_path));
      const { data: t } = await sb.from("tax_exemptions").select("image_path");
      (t ?? []).forEach((r: { image_path: string | null }) => r.image_path && known.add(r.image_path));
    }

    const orphans = files.filter((f) => !known.has(f));

    let deleted = 0;
    if (!dryRun && orphans.length) {
      for (let i = 0; i < orphans.length; i += 100) {
        const batch = orphans.slice(i, i + 100);
        const { error } = await sb.storage.from(bucket).remove(batch);
        if (!error) deleted += batch.length;
      }
    }

    return json({
      bucket, dryRun, scanned: files.length, referenced: known.size,
      orphaned: orphans.length, deleted, sample: orphans.slice(0, 12),
    });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
