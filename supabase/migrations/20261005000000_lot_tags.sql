-- Lot tags (Niimbot B1): record what was printed on each lot tag, so the Items
-- tab can find tags that were never printed or whose price has changed since.
-- See docs/room-capture-spec.md, Lot tags. Staff-only columns: public_lot()
-- and public_sale_lots() do not return them.
--
-- Apply BY HAND (SQL editor). No apostrophes in these comments: the dashboard
-- editor mis-splits on them. Idempotent (safe to re-run).

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS tag_printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tag_price      numeric(10,2);
