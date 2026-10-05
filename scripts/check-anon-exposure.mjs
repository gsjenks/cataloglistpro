// scripts/check-anon-exposure.mjs
// Read-only check of what the PUBLIC anon key can see. Run after applying
// 20261004000000_lots_public_access.sql (and ..._sales_public_access.sql):
//   node scripts/check-anon-exposure.mjs
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env (or the env).
// Writes nothing: hold_lot is only called with a random token (refused before
// any row is touched) or with an incomplete argument list that matches no
// function. The retired hold_lot(p_basket_id) is never called.

import { readFileSync, existsSync } from 'node:fs';

function loadEnv() {
  const env = { ...process.env };
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not found');
  process.exit(2);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function get(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}
async function rpc(fn, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}

const FORBIDDEN = [
  'buyer', 'sold_price', 'reserve_price', 'held_by', 'consignor', 'consignor_id', 'consignment_id',
  'delivery_address', 'delivery_company', 'delivery_company_phone', 'delivery_company_email',
  'delivery_date', 'delivery_estimate', 'second_bidder_contact', 'sold_to_bidder', 'tracking_number',
  'refund_amount', 'payment_status', 'la_invoice_id',
];

let failed = 0;
const result = (ok, label, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};
const noRows = (r) => r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0);

// 1. Direct table reads must return nothing.
for (const [label, path] of [
  ['lots: buyer/sold_price/held_by/delivery', 'lots?select=id,buyer,sold_price,held_by,delivery_address&limit=5'],
  ['lots: any column', 'lots?select=id&limit=5'],
  ['sales: private columns', 'sales?select=id,clerk_notes,buyer_premium,stage_progress&limit=5'],
  ['shoppers', 'shoppers?select=id&limit=5'],
  ['shopper_tokens', 'shopper_tokens?select=id&limit=5'],
  ['sale_baskets', 'sale_baskets?select=sale_id&limit=5'],
  ['sales_transactions', 'sales_transactions?select=id&limit=5'],
  ['sales_transaction_items', 'sales_transaction_items?select=id&limit=5'],
  ['refunds', 'refunds?select=id&limit=5'],
]) {
  const r = await get(path);
  result(noRows(r), `anon cannot read ${label}`, `HTTP ${r.status}, ${Array.isArray(r.body) ? `${r.body.length} rows` : JSON.stringify(r.body)?.slice(0, 120)}`);
}

// 2. Public functions work and return allow-listed columns only. Find a lot via
//    the (intentionally public) photos table.
const photo = await get('photos?select=lot_id&limit=1');
const lotId = Array.isArray(photo.body) && photo.body[0]?.lot_id;
if (!lotId) {
  result(false, 'found a lot id via photos to test the public functions');
} else if ((await rpc('public_lot', { p_lot_id: lotId })).status === 404) {
  // Not applied yet. Stop here: the old hold_lot(p_basket_id) still exists and
  // the probes below must never reach it.
  result(false, 'public_lot exists (migration 20261004000000 applied)', 'HTTP 404');
} else {
  const lot = await rpc('public_lot', { p_lot_id: lotId });
  const keys = lot.body && typeof lot.body === 'object' ? Object.keys(lot.body) : [];
  result(lot.status === 200 && keys.includes('name'), 'public_lot returns the lot', `HTTP ${lot.status}`);
  const leakedLot = keys.filter((k) => FORBIDDEN.includes(k));
  result(leakedLot.length === 0, 'public_lot has no private columns', leakedLot.join(', '));

  const saleId = lot.body?.sale_id;
  const sale = await rpc('public_sale', { p_sale_id: saleId });
  result(sale.status === 200 && !!sale.body?.name && !('clerk_notes' in (sale.body ?? {})), 'public_sale returns public fields only', `HTTP ${sale.status}`);

  const lots = await rpc('public_sale_lots', { p_sale_id: saleId });
  const rows = Array.isArray(lots.body) ? lots.body : [];
  result(lots.status === 200 && rows.length > 0, 'public_sale_lots returns the catalog', `${rows.length} lots`);
  const leakedList = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => FORBIDDEN.includes(k))))];
  result(leakedList.length === 0, 'public_sale_lots has no private columns', leakedList.join(', '));

  // 3. Shopper-only functions refuse a token that isn't one.
  const bogus = 'x'.repeat(43);
  const mine = await rpc('my_lot', { p_lot_id: lotId, p_token: bogus });
  result(mine.status === 200 && mine.body === null, 'my_lot returns nothing for a bad token', JSON.stringify(mine.body));
  const basket = await rpc('my_basket', { p_sale_id: saleId, p_token: bogus });
  result(basket.body?.error === 'invalid_token', 'my_basket refuses a bad token', JSON.stringify(basket.body));
  const hold = await rpc('hold_lot', { p_lot_id: lotId, p_token: bogus });
  result(hold.body?.error === 'invalid_token', 'hold_lot refuses a bad token', JSON.stringify(hold.body));

  // 4. The old bare-id signature is gone. Never call it: if it still exists it
  //    would run. Call hold_lot with p_lot_id alone, which matches no signature,
  //    and read PostgREST's "did you mean" hint for p_basket_id instead.
  const probe = await rpc('hold_lot', { p_lot_id: lotId });
  const hint = JSON.stringify(probe.body ?? '');
  result(probe.status >= 400 && !hint.includes('p_basket_id'), 'hold_lot(p_basket_id) no longer exists', hint.slice(0, 160));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
