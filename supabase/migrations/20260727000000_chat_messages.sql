-- Bidder ↔ auctioneer chat.
--
-- Until now the two chat components (BidderChat.tsx, ClerkChat.tsx) read and
-- wrote a `chat_messages` table that existed only in the dashboard — no
-- migration, no RLS, not in the realtime publication. This backfills all three
-- so the table is reproducible and the trust model is enforced server-side.
--
-- Trust model (previously client-trusted, therefore spoofable):
--   • is_clerk = true  may only be written by a member of the sale's company.
--   • is_clerk = false may only be written by a bidder registered for the sale,
--     and only tagged with that bidder's own id.
--   • Reads are limited to the sale's company members and its registered bidders.

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid NOT NULL REFERENCES public.sales(id)   ON DELETE CASCADE,
  bidder_id   uuid          REFERENCES public.bidders(id) ON DELETE SET NULL,
  sender_name text NOT NULL,
  message     text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  is_clerk    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_sale_created_idx
  ON public.chat_messages (sale_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Read: company members of the sale, or bidders registered for the sale.
DROP POLICY IF EXISTS chat_select ON public.chat_messages;
CREATE POLICY chat_select ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    sale_id IN (
      SELECT id FROM public.sales
      WHERE company_id IN (
        SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
      )
    )
    OR sale_id IN (
      SELECT ar.sale_id
      FROM public.auction_registrations ar
      JOIN public.bidders b ON b.id = ar.bidder_id
      WHERE b.user_id = auth.uid()
    )
  );

-- Clerk writes: is_clerk = true, only for a sale in one of your companies.
DROP POLICY IF EXISTS chat_insert_clerk ON public.chat_messages;
CREATE POLICY chat_insert_clerk ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    is_clerk = true
    AND sale_id IN (
      SELECT id FROM public.sales
      WHERE company_id IN (
        SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()
      )
    )
  );

-- Bidder writes: is_clerk = false, tagged with your own bidder id, and only for
-- a sale you are registered for.
DROP POLICY IF EXISTS chat_insert_bidder ON public.chat_messages;
CREATE POLICY chat_insert_bidder ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    is_clerk = false
    AND bidder_id IN (SELECT id FROM public.bidders WHERE user_id = auth.uid())
    AND sale_id IN (
      SELECT ar.sale_id
      FROM public.auction_registrations ar
      JOIN public.bidders b ON b.id = ar.bidder_id
      WHERE b.user_id = auth.uid()
    )
  );

-- Realtime: full rows on change, and add the table to the publication.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already in the publication
END $$;
