-- Sales: close anonymous reads (companion to 20261004000000_lots_public_access).
--
-- Checked 2026-10-04 with the anon key: every column of every sale was readable,
-- including clerk_notes, buyer_premium, stage_progress (override names and
-- reasons) and company_id. Public pages now read sales only through
-- public_sale(), defined in the previous migration, so this can be applied
-- independently of — but must come after — that one.
--
-- Like lots, the sales policies existed only in the hosted DB. Snapshot first:
--   select policyname, roles, cmd, qual, with_check from pg_policies for the
--   public.sales table, and keep the output.
-- The DO block prints each dropped policy as a NOTICE.
-- Idempotent (safe to re-run).

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname, roles, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'sales'
  LOOP
    RAISE NOTICE 'dropping sales policy % (roles=% cmd=% using=% check=%)',
      p.policyname, p.roles, p.cmd, p.qual, p.with_check;
    EXECUTE format('DROP POLICY %I ON public.sales', p.policyname);
  END LOOP;
END $$;

-- Company member or owner, the same rule delete_sale() uses.
CREATE POLICY sales_company_members ON public.sales
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  );

REVOKE ALL ON public.sales FROM anon;
