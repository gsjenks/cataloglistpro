// supabase/functions/send-invite/index.ts
// Sends a team invitation email via Resend. The invite record itself is created
// by the app (company_invites); this just notifies the person. When they sign
// in with that email, claim_company_invites() adds them to the company.
//
// Secrets: RESEND_API_KEY, RESEND_FROM (already set for shopper verification).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "onboarding@resend.dev";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { email, companyName, role, appUrl } = await req.json();
    if (!email || !companyName) return json({ error: "email and companyName required" }, 400);
    if (!RESEND_API_KEY) return json({ success: false, error: "RESEND_API_KEY not set" });

    const link = appUrl || "https://cataloglistpro.vercel.app/";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: email,
        subject: `You're invited to join ${companyName}`,
        html: `<div style="font-family:sans-serif;max-width:480px">
          <p>You've been invited to join <strong>${companyName}</strong> on CatalogListPro${role ? ` as ${role === "admin" ? "an admin" : "a member"}` : ""}.</p>
          <p>To accept, sign in or create an account using <strong>${email}</strong>:</p>
          <p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open CatalogListPro</a></p>
          <p style="color:#888;font-size:12px;margin-top:16px">You'll be added to ${companyName} automatically the first time you sign in with this email address.</p>
        </div>`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ success: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` });
    }
    return json({ success: true });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
