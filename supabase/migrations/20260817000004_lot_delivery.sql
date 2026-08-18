-- Per-item delivery details on the lot itself. Estate delivery info normally
-- lives on the POS transaction, but some sold-for-delivery lots have no linked
-- transaction (hand-marked sales, or sales without a captured buyer). These
-- columns give every delivery a place to store its address/date/mover so it can
-- be entered, reviewed, and printed from Fulfillment — including after close.
-- Idempotent (safe to re-run).

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS delivery_address       text,
  ADD COLUMN IF NOT EXISTS delivery_date          text,
  ADD COLUMN IF NOT EXISTS delivery_estimate      text,
  ADD COLUMN IF NOT EXISTS delivery_company       text,
  ADD COLUMN IF NOT EXISTS delivery_company_phone text,
  ADD COLUMN IF NOT EXISTS delivery_company_email text;
