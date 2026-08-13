-- EOA import (#2, D3) — capture the winning-buyer, buyer's premium, and LA invoice
-- that the LiveAuctioneers End-of-Auction export carries per lot. Buyer is stored as
-- jsonb (name/email/phone + shipping address) so fulfillment (Stage 6) and payment
-- resolution (Stage 5) can use it without a wide column set.
-- Idempotent (safe to re-run). See docs/auction-lifecycle-spec.md.

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS buyer           jsonb,   -- {name,email,phone,address,city,state,zip,country,username}
  ADD COLUMN IF NOT EXISTS buyers_premium  numeric,
  ADD COLUMN IF NOT EXISTS la_invoice_id   text;
