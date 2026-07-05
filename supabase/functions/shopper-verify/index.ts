// supabase/functions/shopper-verify/index.ts
// Shopper registration + verification for estate-sale self-checkout.
//   action:"request" -> find/create shopper, issue a 6-digit code, send via
//                       email (Resend) or SMS (Twilio).
//   action:"verify"  -> check the code, mark the channel verified.
// If a provider key is missing, runs in TEST MODE and returns the code so the
// flow is testable before Resend/Twilio are configured.
//
// Secrets (set with `supabase secrets set`): DB_URL, DB_SERVICE_KEY,
//   RESEND_API_KEY, RESEND_FROM, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("DB_URL")!;
const SERVICE_KEY = Deno.env.get("DB_SERVICE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "onboarding@resend.dev";
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

interface SendResult {
  ok: boolean;
  detail?: string;
}

async function sendEmail(to: string, code: string): Promise<SendResult> {
  if (!RESEND_API_KEY) return { ok: false, detail: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject: `Your verification code: ${code}`,
      html: `<div style="font-family:sans-serif"><p>Your estate sale verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
        <p style="color:#888;font-size:12px">This code expires in 10 minutes.</p></div>`,
    }),
  });
  if (res.ok) return { ok: true };
  const detail = await res.text().catch(() => "");
  return { ok: false, detail: `resend ${res.status}: ${detail.slice(0, 300)}` };
}

async function sendSms(to: string, code: string): Promise<SendResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return { ok: false, detail: "twilio secrets not set" };
  const body = new URLSearchParams({
    To: to,
    From: TWILIO_FROM,
    Body: `Your estate sale verification code is ${code}. It expires in 10 minutes.`,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, detail: `twilio ${res.status}: ${text.slice(0, 300)}` };

  // Twilio accepted the request (HTTP 201) — but that does NOT mean it was
  // delivered. Parse the message SID/status and poll once for the real outcome,
  // so a downstream failure (e.g. 30032 unverified toll-free, 30007 carrier
  // filtered) is surfaced instead of a false "sent".
  let sid = "";
  let status = "";
  try {
    const created = JSON.parse(text);
    sid = created.sid ?? "";
    status = created.status ?? "";
    if (created.error_code) {
      return { ok: false, detail: `twilio created status=${status} error_code=${created.error_code} ${created.error_message ?? ""}`.trim() };
    }
  } catch {
    /* fall through — treat as accepted */
  }

  if (sid) {
    // Give Twilio a moment, then read the message's final-ish status.
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const poll = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages/${sid}.json`,
        { headers: { Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`) } },
      );
      if (poll.ok) {
        const m = await poll.json();
        status = m.status ?? status;
        if (m.error_code || status === "failed" || status === "undelivered") {
          return {
            ok: false,
            detail: `twilio status=${status} error_code=${m.error_code ?? "?"} ${m.error_message ?? ""}`.trim(),
          };
        }
      }
    } catch {
      /* polling is best-effort */
    }
  }
  return { ok: true, detail: `twilio sid=${sid} status=${status}` };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const payload = await req.json();

    if (payload.action === "request") {
      const { saleId, name, email, phone } = payload;
      const channel = payload.channel === "sms" ? "sms" : "email";
      if (!name || (!email && !phone)) return json({ error: "name and email or phone required" }, 400);
      const destination = channel === "sms" ? phone : email;
      if (!destination) return json({ error: `no ${channel} provided` }, 400);

      let companyId: string | null = null;
      if (saleId) {
        const { data: sale } = await supabase.from("sales").select("company_id").eq("id", saleId).single();
        companyId = sale?.company_id ?? null;
      }

      // Find-or-create the shopper by company + (email or phone).
      const orFilters: string[] = [];
      if (email) orFilters.push(`email.eq.${email}`);
      if (phone) orFilters.push(`phone.eq.${phone}`);
      const { data: existing } = await supabase
        .from("shoppers")
        .select("id")
        .eq("company_id", companyId)
        .or(orFilters.join(","))
        .limit(1)
        .maybeSingle();

      let shopperId: string;
      if (existing) {
        shopperId = existing.id;
        await supabase
          .from("shoppers")
          .update({ name, email: email ?? undefined, phone: phone ?? undefined, updated_at: new Date().toISOString() })
          .eq("id", shopperId);
      } else {
        const { data: created, error } = await supabase
          .from("shoppers")
          .insert({ company_id: companyId, name, email: email ?? null, phone: phone ?? null })
          .select("id")
          .single();
        if (error || !created) return json({ error: "could not create shopper" }, 500);
        shopperId = created.id;
      }

      const code = genCode();
      await supabase.from("shopper_verifications").insert({
        shopper_id: shopperId,
        channel,
        destination,
        code_hash: await sha256(code),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const result = channel === "sms" ? await sendSms(destination, code) : await sendEmail(destination, code);
      // Test mode: return the code (and the provider error) when sending fails.
      // Always return `debug` (provider SID/status) so delivery can be traced.
      return json({
        shopperId,
        channel,
        sent: result.ok,
        testCode: result.ok ? undefined : code,
        debug: result.detail,
      });
    }

    if (payload.action === "verify") {
      const { shopperId, code } = payload;
      if (!shopperId || !code) return json({ error: "shopperId and code required" }, 400);
      const { data: v } = await supabase
        .from("shopper_verifications")
        .select("*")
        .eq("shopper_id", shopperId)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!v) return json({ success: false, error: "no_code" });
      if (new Date(v.expires_at).getTime() < Date.now()) return json({ success: false, error: "expired" });
      if (v.attempts >= 5) return json({ success: false, error: "too_many_attempts" });
      if ((await sha256(String(code))) !== v.code_hash) {
        await supabase.from("shopper_verifications").update({ attempts: v.attempts + 1 }).eq("id", v.id);
        return json({ success: false, error: "invalid_code" });
      }
      await supabase.from("shopper_verifications").update({ consumed_at: new Date().toISOString() }).eq("id", v.id);
      const patch = v.channel === "sms" ? { phone_verified: true } : { email_verified: true };
      const { data: shopper } = await supabase
        .from("shoppers")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", shopperId)
        .select("id, name")
        .single();
      return json({ success: true, shopper });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
