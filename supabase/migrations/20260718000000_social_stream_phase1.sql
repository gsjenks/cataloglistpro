-- Social Media Sales Stream — Phase 1: webhook ingestion + comment claims
--
-- A THIRD selling path (sale_type='social') alongside estate_sale and auction.
-- Sell live/Reels on Facebook or Instagram: a buyer comments to claim an item,
-- Meta delivers the comment to our webhook, we match it to a lot and place a
-- hold, and record a "claim". Delivering checkout links (Private Replies) and
-- OAuth token management arrive in later phases.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- Safe to re-run (IF NOT EXISTS / idempotent constraint swaps).

-- 1) New sale type -----------------------------------------------------------
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_type_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_sale_type_check
  CHECK (sale_type IN ('estate_sale', 'auction', 'social'));

-- 2) Connected Meta accounts (Facebook Page / IG business account) -----------
-- One row per company per connected account. The access token lives in a
-- separate service-role-only table so company members can see connection
-- STATUS without ever reading the secret.
CREATE TABLE IF NOT EXISTS public.social_connections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL,
  platform            text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  external_account_id text NOT NULL,              -- FB Page id or IG business account id
  account_name        text,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'revoked', 'expired')),
  token_expires_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- The webhook maps an inbound event's account id -> exactly one connection.
  CONSTRAINT social_connections_account_uniq UNIQUE (platform, external_account_id)
);
CREATE INDEX IF NOT EXISTS idx_social_connections_company
  ON public.social_connections (company_id);

-- Access tokens: service-role only (no RLS policies -> anon/authenticated can't
-- read it). Mirrors how shopper_verifications keeps secrets out of the client.
CREATE TABLE IF NOT EXISTS public.social_connection_secrets (
  connection_id uuid PRIMARY KEY
                  REFERENCES public.social_connections(id) ON DELETE CASCADE,
  access_token  text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 3) A stream = one live/Reel selling session tied to a sale ----------------
CREATE TABLE IF NOT EXISTS public.social_streams (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id           uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL,
  connection_id     uuid REFERENCES public.social_connections(id) ON DELETE SET NULL,
  platform          text NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  media_type        text NOT NULL DEFAULT 'reel'
                      CHECK (media_type IN ('reel', 'live', 'post')),
  -- FB live_video id / Reel|post id, or IG media id. The webhook uses this to
  -- route an inbound comment to the right stream; null until the media is known.
  external_media_id text,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'live', 'ended')),
  -- Keyword a buyer prefixes to claim (e.g. "SOLD 12"). Matching is keyword-
  -- optional in Phase 1 (a bare lot number also matches).
  claim_keyword     text DEFAULT 'sold',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_streams_company_status
  ON public.social_streams (company_id, status);
CREATE INDEX IF NOT EXISTS idx_social_streams_media
  ON public.social_streams (external_media_id);
CREATE INDEX IF NOT EXISTS idx_social_streams_sale
  ON public.social_streams (sale_id);

-- 4) A claim = one commenter claiming a lot ---------------------------------
CREATE TABLE IF NOT EXISTS public.social_claims (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id            uuid REFERENCES public.social_streams(id) ON DELETE SET NULL,
  sale_id              uuid,
  company_id           uuid NOT NULL,
  lot_id               uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  platform             text CHECK (platform IN ('facebook', 'instagram')),
  external_comment_id  text,                       -- for idempotency + Private Reply target
  commenter_external_id text,                      -- PSID / IGSID
  commenter_name       text,
  comment_text         text,
  matched_token        text,                       -- the lot-number token we matched
  shopper_id           uuid REFERENCES public.shoppers(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'held', 'checkout_sent',
                                           'purchased', 'released', 'failed')),
  checkout_url         text,
  hold_basket_id       text,                       -- the held_by value used on the lot
  note                 text,                        -- why a claim failed / staff notes
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- The webhook is at-least-once; the same comment can arrive twice. This makes
  -- ingestion idempotent (ON CONFLICT DO NOTHING).
  CONSTRAINT social_claims_comment_uniq UNIQUE (platform, external_comment_id)
);
CREATE INDEX IF NOT EXISTS idx_social_claims_company_status
  ON public.social_claims (company_id, status);
CREATE INDEX IF NOT EXISTS idx_social_claims_stream
  ON public.social_claims (stream_id);
CREATE INDEX IF NOT EXISTS idx_social_claims_lot
  ON public.social_claims (lot_id);

-- 5) RLS ---------------------------------------------------------------------
-- Company members can read/manage connections, streams and claims for their own
-- companies. The webhook Edge Function uses the service role and bypasses RLS.
-- social_connection_secrets has NO policies -> only the service role can read
-- the access token.
ALTER TABLE public.social_connections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_streams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_claims             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_connections_company_members ON public.social_connections;
CREATE POLICY social_connections_company_members ON public.social_connections
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS social_streams_company_members ON public.social_streams;
CREATE POLICY social_streams_company_members ON public.social_streams
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS social_claims_company_members ON public.social_claims;
CREATE POLICY social_claims_company_members ON public.social_claims
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
