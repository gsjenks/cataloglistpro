-- Keep the per-lot lines LiveAuctioneers printed on each invoice.
--
-- The parser already reads them; only the totals and lot numbers were stored. When a
-- single lot later falls out of a multi-lot invoice — the buyer never paid for it, or
-- it came back — the buyer's invoice has to show a credit for exactly what LA billed
-- for THAT lot. Re-deriving it from the lot row doesn't work once the lot is re-sold
-- at a different price, so the amounts are kept as billed.
--
-- Idempotent (safe to re-run). Populated on the next invoice-PDF import.

ALTER TABLE public.buyer_invoices
  ADD COLUMN IF NOT EXISTS lines jsonb NOT NULL DEFAULT '[]'::jsonb;
  -- [{ lotNumber, title, hammer, premium, price }]
