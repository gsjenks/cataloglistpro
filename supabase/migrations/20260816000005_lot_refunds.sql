-- Refunds: a lot that was paid for and then given back.
--
-- Distinct from a default (never paid) — money actually went out, and that has to be
-- recorded rather than inferred. The lot itself returns to unsold (outcome 'passed')
-- so it can be re-sold, returned to the consignor or donated, exactly like any other
-- lot that didn't complete; `payment_status = 'refunded'` is what distinguishes it
-- from a deadbeat buyer on screen and on the invoice.
--
-- Note the shipment fields are deliberately NOT cleared by a refund — a refunded lot
-- often did ship, and that's history worth keeping. It leaves the fulfillment board
-- anyway, which only lists lots that are sold AND paid.
--
-- Idempotent (safe to re-run).

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS refund_amount numeric,
  ADD COLUMN IF NOT EXISTS refunded_at   timestamptz,
  ADD COLUMN IF NOT EXISTS refund_method text,     -- cash | check | card | la | other
  ADD COLUMN IF NOT EXISTS refund_reason text;
