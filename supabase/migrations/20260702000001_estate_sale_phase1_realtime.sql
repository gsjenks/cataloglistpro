-- Estate Sale POS — Phase 1: enable realtime on lots
-- Lets every staff device receive live available/held/sold updates for a sale.
-- Safe to re-run.

-- REPLICA IDENTITY FULL so UPDATE/DELETE events carry all columns (needed for
-- the sale_id filter to match on deletes and to receive full rows).
ALTER TABLE public.lots REPLICA IDENTITY FULL;

-- Add the table to the realtime publication (ignore if already a member).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lots;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already in the publication
END $$;
