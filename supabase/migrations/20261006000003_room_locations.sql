-- Room capture foundation: each sale gets its own room list, and every lot can
-- carry a room and a location so the crew can find it after the charts move.
-- See docs/room-capture-spec.md (Room codes, locations and flip charts).
--
--   sale_rooms        the sale room list, built from the catalog in
--                     src/lib/roomCodes.ts. room_code is the two-letter type plus
--                     a two-digit number (LR01, BD02); name is what this sale
--                     calls it (Gathering room in place of Family room).
--   lots.room         the room code, e.g. BD02
--   lots.zone         the full location, e.g. BD02-5 (room, dash, location 1 to 20)
--   lots.needs_detail the item still needs a proper detail photo (set by capture)
--
-- Staff only: public_lot and public_sale_lots do not return these columns.
-- Apply BY HAND (SQL editor). No apostrophes in comments: the dashboard editor
-- mis-splits on them. Idempotent (safe to re-run).

CREATE TABLE IF NOT EXISTS public.sale_rooms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  room_code  text NOT NULL CHECK (room_code ~ '^[A-Z]{2}[0-9]{2}$'),
  name       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_id, room_code)
);
CREATE INDEX IF NOT EXISTS idx_sale_rooms_sale ON public.sale_rooms (sale_id, sort_order);

ALTER TABLE public.sale_rooms ENABLE ROW LEVEL SECURITY;

-- Company member or owner of the sale, the same rule as lots.
DROP POLICY IF EXISTS sale_rooms_company_members ON public.sale_rooms;
CREATE POLICY sale_rooms_company_members ON public.sale_rooms
  FOR ALL TO authenticated
  USING (
    sale_id IN (
      SELECT s.id FROM public.sales s
       WHERE s.company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
          OR s.company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    sale_id IN (
      SELECT s.id FROM public.sales s
       WHERE s.company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
          OR s.company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
    )
  );

REVOKE ALL ON public.sale_rooms FROM anon;

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS room         text,
  ADD COLUMN IF NOT EXISTS zone         text,
  ADD COLUMN IF NOT EXISTS needs_detail boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lots_sale_room ON public.lots (sale_id, room);
