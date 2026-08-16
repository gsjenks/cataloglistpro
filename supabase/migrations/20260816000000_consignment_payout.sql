-- Stage 7 Reconciliation — consignor payout details.
-- `consignments` already carries net_due / settled_at / paid_at / payment_method
-- (20260813000000). This adds the two fields the payout record was missing: the
-- check / ACH / wire reference and a free-text note.
-- See docs/auction-lifecycle-spec.md §3 Stage 7.
--
-- Idempotent (safe to re-run). Committing this file does not apply it; it runs on
-- the next `supabase db push`.

ALTER TABLE public.consignments
  ADD COLUMN IF NOT EXISTS payment_reference text,   -- check #, ACH/wire confirmation
  ADD COLUMN IF NOT EXISTS payout_note       text;
