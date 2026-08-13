-- Auction lifecycle (#2 Setup) — schema for the 3rd-party / LiveAuctioneers path.
-- Adds: the sale STAGE pipeline + checklist progress, a per-consignor consignments
-- table, lot -> consignor tagging, and the post-auction lot outcome / payment /
-- disposition / fulfillment fields that Stages 5-7 drive.
-- See docs/auction-lifecycle-spec.md.
--
-- Idempotent (safe to re-run). Every add is IF NOT EXISTS and existing columns are
-- left untouched, so this is safe whether or not the hosted schema already has any
-- of these — several core lots/sales columns are NOT version-controlled in this repo.
-- Committing this file does not apply it; it runs on the next `supabase db push`.

-- == Sales: stage pipeline + checklist progress + LA listing metadata ==========
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS stage             text,   -- intake|setup|listed|live|settlement|fulfillment|reconciliation|closed
  ADD COLUMN IF NOT EXISTS stage_progress    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { [itemKey]: {done, done_at, done_by, note} }
  ADD COLUMN IF NOT EXISTS la_auction_url    text,
  ADD COLUMN IF NOT EXISTS auction_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS la_approved_at    timestamptz;

-- Seed stage from the existing coarse status for sales that predate the pipeline.
UPDATE public.sales
  SET stage = CASE
    WHEN status = 'completed' THEN 'closed'
    WHEN status = 'active'    THEN 'live'
    ELSE 'intake'
  END
  WHERE stage IS NULL;

-- == Consignments: one row per (sale, consignor). A sale pools lots from many. ==
CREATE TABLE IF NOT EXISTS public.consignments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid,          -- denormalized for RLS, matches app pattern
  sale_id             uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  contact_id          uuid,          -- the consignor (reuses public.contacts)
  commission_rate     numeric,
  buyers_premium_rate numeric,
  reserve_policy      text,          -- none|per_lot|blanket
  fee_schedule        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {photography,cataloging,insurance,storage,buyin}
  lead_source         text,
  -- Reconciliation (Stage 7) — settlement is per consignment.
  net_due             numeric,
  settled_at          timestamptz,
  paid_at             timestamptz,
  payment_method      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consignments_sale    ON public.consignments (sale_id);
CREATE INDEX IF NOT EXISTS idx_consignments_company ON public.consignments (company_id);

-- RLS: company members manage their consignments (mirrors the shoppers pattern).
ALTER TABLE public.consignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consignments_company_members ON public.consignments;
CREATE POLICY consignments_company_members ON public.consignments
  FOR ALL
  USING      (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- == Lots: consignor tag + cataloging + post-auction state machines ============
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS consignment_id        uuid REFERENCES public.consignments(id) ON DELETE SET NULL,
  -- Setup / cataloging (Stage 2)
  ADD COLUMN IF NOT EXISTS condition_report      text,
  ADD COLUMN IF NOT EXISTS weight                numeric,        -- feeds shipping quotes (Stage 6)
  ADD COLUMN IF NOT EXISTS is_restricted         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restricted_category   text,
  -- Post-auction outcome + payment resolution (spec §4.1)
  ADD COLUMN IF NOT EXISTS outcome               text,           -- pending|sold|passed
  ADD COLUMN IF NOT EXISTS payment_status        text,           -- unpaid|paid|second_chance|defaulted
  ADD COLUMN IF NOT EXISTS payment_due_at        timestamptz,    -- won_at + 72h (set by app on EOA import)
  ADD COLUMN IF NOT EXISTS second_bidder_amount  numeric,        -- manual entry (LA export omits it)
  ADD COLUMN IF NOT EXISTS second_bidder_contact text,           -- manual entry
  -- Unsold disposition cascade (spec §4.2)
  ADD COLUMN IF NOT EXISTS disposition           text,           -- returned|hold_relist|charity
  ADD COLUMN IF NOT EXISTS disposition_at        timestamptz,
  ADD COLUMN IF NOT EXISTS disposition_note      text,
  -- Fulfillment (Stage 6)
  ADD COLUMN IF NOT EXISTS fulfillment_method    text,           -- ship|pickup
  ADD COLUMN IF NOT EXISTS tracking_number       text,
  ADD COLUMN IF NOT EXISTS shipped_at            timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at          timestamptz;
CREATE INDEX IF NOT EXISTS idx_lots_consignment ON public.lots (consignment_id);
