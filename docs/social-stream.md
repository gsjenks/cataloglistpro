# Social Media Sales Stream (comment-selling)

A **third selling path** (`sale_type='social'`) alongside the Estate Sale (on-site
POS) and Auction paths. Sell live or via Reels on **Facebook / Instagram**: a
buyer comments to claim an item, Meta delivers the comment to our webhook, we
match it to a lot, place a hold, and (later phases) DM the buyer a checkout link
that reuses the existing shopper → basket → Square flow.

## Platform reality (verified 2026-07-18)

| Capability | Facebook Page | Instagram |
|---|---|---|
| Real-time comment webhooks | ✅ `feed` field delivers post/Reel comments; Live has a dedicated comment stream | ⚠️ `comments` field on public IG business media; **Live comments only during broadcast**; subscription is all-or-nothing |
| Deliver checkout link privately | ✅ **Private Replies** — one DM per comment, within 7 days (`pages_messaging`) | ✅ Private Replies (`instagram_business_manage_messages`) |
| App Review before real buyers | Yes (`pages_read_engagement`, `pages_manage_engagement`, `pages_messaging`) | Yes (`instagram_business_manage_comments`, `_manage_messages`) |

**Decisions:** Facebook Page is the reliable first target; IG is built generically
but hardened later. Checkout links are delivered via **Private Replies**.

## Phases

- **Phase 1 — Webhook ingestion + claim capture (BUILT).** `sale_type='social'`,
  tables, and the `social-webhook` Edge Function. Testable in Meta **dev mode**;
  no App Review required.
- **Phase 2 — Connection + token management.** OAuth to connect a Page/IG account,
  store tokens (service-role only), subscribe the page to webhook fields.
- **Phase 3 — Deliver checkout links** via Private Replies → shopper/basket → Square.
- **Phase 4 — Staff "Live Sale" console** (realtime claims feed, approve/override
  matches) + IG hardening.

## Data model (Phase 1)

Migration: `supabase/migrations/20260718000000_social_stream_phase1.sql`

- `social_connections` — one connected Meta account per company (FB Page / IG
  business account). Routes an inbound event's `external_account_id` → company.
- `social_connection_secrets` — access token, **service-role only** (no RLS
  policies), keyed by `connection_id`.
- `social_streams` — one live/Reel selling session tied to a sale. `status`
  draft→live→ended. `external_media_id` routes a comment to the right stream.
- `social_claims` — one row per claiming comment. Idempotent on
  `(platform, external_comment_id)`. `status`: pending / held / checkout_sent /
  purchased / released / failed. Every attempt is recorded (even non-matches) so
  the Phase 4 console can show them.

Holds reuse the estate-sale mechanism (`lots.inventory_status`/`held_by`/
`held_until`); the webhook holds as service role with `held_by='social:<comment_id>'`.

## Webhook Edge Function (Phase 1)

`supabase/functions/social-webhook/index.ts`

- `GET` — verification handshake (`hub.mode`/`hub.verify_token`/`hub.challenge`).
- `POST` — verify `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the app
  secret), parse FB `feed` + IG `comments` shapes, match a lot number token
  (`parseLotToken`: "SOLD 12" / "#12" / bare "12"), place a hold, record a claim.
  Always answers `200` so Meta doesn't retry/disable the webhook.

### Secrets to set
```
supabase secrets set META_VERIFY_TOKEN=<any-random-string>
supabase secrets set META_APP_SECRET=<your-meta-app-secret>
# DB_URL / DB_SERVICE_KEY already set (shared with other functions)
```
`supabase functions deploy social-webhook`

## What the owner (you) must do

1. Create a Meta app (Business type) at developers.facebook.com.
2. Add the webhook callback URL (the deployed `social-webhook` URL) + the verify
   token; subscribe the Page to the `feed` field (and IG to `comments`).
3. Add yourself as a tester/admin to test in **dev mode** before App Review.
4. Submit for App Review to sell to the public.

## Open questions / defaults (may revisit)

- **Claim matching** keys off `lots.lot_number`. Keyword is optional in Phase 1.
- **First-come wins**: the first valid comment holds the lot; later claims on a
  held/sold lot are recorded as `failed` with a reason.
- Whether a `social` sale reuses the estate-sale self-checkout gate or gets its
  own is deferred to Phase 3 (checkout delivery).
