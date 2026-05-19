// supabase/functions/watched-lot-alert/index.ts
// Sends email alerts to bidders watching lots:
//   1. When their watched lot goes LIVE (exact match)
//   2. When their watched lot is 5 lots away (coming up soon)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL   = Deno.env.get("DB_URL")!;
const SUPABASE_KEY   = Deno.env.get("DB_SERVICE_KEY")!;
const SITE_URL       = Deno.env.get("SITE_URL") ?? "http://localhost:5173";
const LOTS_AHEAD     = 5;

async function sendEmail(to: string, subject: string, html: string) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    "Benson Auction Services <onboarding@resend.dev>",
      to:      "gsjenks@yahoo.com", // TODO: use `to` param in production with verified domain
      subject,
      html,
    }),
  });
}

function buildEmail(opts: {
  firstName:    string;
  lotNumber:    number;
  lotName:      string;
  estimateLow:  number | null;
  estimateHigh: number | null;
  saleUrl:      string;
  isLive:       boolean;
  lotsAway?:    number;
}): string {
  const estLine = opts.estimateLow && opts.estimateHigh
    ? `<div style="font-size:13px;color:#888;margin-top:4px;">Estimate: $${opts.estimateLow.toLocaleString()} – $${opts.estimateHigh.toLocaleString()}</div>`
    : "";

  const badgeBg   = opts.isLive ? "#cc2200" : "#1a6496";
  const badgeText = opts.isLive ? "🔨 NOW ON BLOCK" : `⏰ COMING UP IN ${opts.lotsAway} LOTS`;
  const headline  = opts.isLive
    ? "A lot you're watching is <strong>NOW LIVE</strong>"
    : `A lot you're watching is coming up <strong>in ${opts.lotsAway} lots</strong>`;
  const btnText   = opts.isLive ? "Bid Now →" : "View Auction →";

  return `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
      <div style="background:#1a1a1a;padding:16px 20px;border-bottom:2px solid #c9a84c;">
        <h2 style="color:#c9a84c;margin:0;font-size:18px;letter-spacing:.05em;">BENSON AUCTION SERVICES</h2>
      </div>
      <div style="padding:24px 20px;background:#fff;">
        <p style="color:#888;font-size:13px;margin:0 0 6px;">Hi ${opts.firstName},</p>
        <p style="font-size:18px;color:#1a1a1a;margin:0 0 16px;">${headline}</p>
        <div style="background:#f8f8f8;border-left:4px solid ${badgeBg};padding:14px 16px;border-radius:3px;">
          <div style="display:inline-block;background:${badgeBg};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:2px;margin-bottom:6px;letter-spacing:.08em;">${badgeText}</div>
          <div style="font-size:11px;color:#aaa;font-weight:700;letter-spacing:.1em;">LOT ${opts.lotNumber}</div>
          <div style="font-size:19px;font-weight:700;color:#1a1a1a;margin-top:4px;">${opts.lotName}</div>
          ${estLine}
        </div>
        <a href="${opts.saleUrl}" style="display:inline-block;background:${badgeBg};color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:700;font-size:15px;margin-top:20px;">${btnText}</a>
        <p style="font-size:11px;color:#bbb;margin-top:20px;">You're receiving this because you watched this lot on Benson Auction Services.</p>
      </div>
    </div>
  `;
}

serve(async (req) => {
  try {
    const payload   = await req.json();
    const record    = payload.record;
    const oldRecord = payload.old_record;

    if (!record?.current_lot_id) return new Response("No lot", { status: 200 });
    if (record.current_lot_id === oldRecord?.current_lot_id) return new Response("Same lot", { status: 200 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const saleId   = record.sale_id;
    const saleUrl  = `${SITE_URL}/auction/${saleId}`;
    let sentCount  = 0;

    // Get current lot
    const { data: currentLot } = await supabase
      .from("lots")
      .select("id, lot_number, name, sort_order, estimate_low, estimate_high")
      .eq("id", record.current_lot_id)
      .single();

    if (!currentLot) return new Response("Lot not found", { status: 200 });

    // ── 1. NOW LIVE emails ───────────────────────────────
    const { data: liveWatchers } = await supabase
      .from("watched_lots")
      .select("bidder:bidders ( first_name, email )")
      .eq("lot_id", currentLot.id);

    if (liveWatchers?.length) {
      await Promise.all(
        liveWatchers
          .filter((w: any) => w.bidder?.email)
          .map((w: any) => sendEmail(
            w.bidder.email,
            `🔨 LOT ${currentLot.lot_number} is NOW LIVE — ${currentLot.name}`,
            buildEmail({
              firstName: w.bidder.first_name, lotNumber: currentLot.lot_number,
              lotName: currentLot.name, estimateLow: currentLot.estimate_low,
              estimateHigh: currentLot.estimate_high, saleUrl, isLive: true,
            })
          ))
      );
      sentCount += liveWatchers.length;
    }

    // ── 2. COMING UP IN 5 LOTS emails ───────────────────
    const { data: upcomingLot } = await supabase
      .from("lots")
      .select("id, lot_number, name, estimate_low, estimate_high")
      .eq("sale_id", saleId)
      .gt("sort_order", currentLot.sort_order)
      .order("sort_order", { ascending: true })
      .range(LOTS_AHEAD - 1, LOTS_AHEAD - 1)
      .maybeSingle();

    if (upcomingLot) {
      const { data: upcomingWatchers } = await supabase
        .from("watched_lots")
        .select("bidder:bidders ( first_name, email )")
        .eq("lot_id", upcomingLot.id);

      if (upcomingWatchers?.length) {
        await Promise.all(
          upcomingWatchers
            .filter((w: any) => w.bidder?.email)
            .map((w: any) => sendEmail(
              w.bidder.email,
              `⏰ LOT ${upcomingLot.lot_number} coming up in ${LOTS_AHEAD} lots — ${upcomingLot.name}`,
              buildEmail({
                firstName: w.bidder.first_name, lotNumber: upcomingLot.lot_number,
                lotName: upcomingLot.name, estimateLow: upcomingLot.estimate_low,
                estimateHigh: upcomingLot.estimate_high, saleUrl,
                isLive: false, lotsAway: LOTS_AHEAD,
              })
            ))
        );
        sentCount += upcomingWatchers.length;
      }
    }

    return new Response(JSON.stringify({ sent: sentCount }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});