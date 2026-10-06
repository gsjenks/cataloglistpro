-- Staff roles: owner, admin, manager, staff (src/lib/roles.ts). 'member' was
-- the old name for staff. The app gates screens by role; the database does
-- not yet enforce the staff limits (register, money, refunds, deletes, setup,
-- stages). Apply BY HAND. No apostrophes in comments: the dashboard editor
-- mis-splits on them. Idempotent.

-- 1. Drop the old role CHECK constraints (remote-only on user_companies, so
--    matched by definition rather than by name).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('public.company_invites'::regclass, 'public.user_companies'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    RAISE NOTICE 'dropping % on %', r.conname, r.tbl;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- 2. member (or anything unrecognised) becomes staff.
UPDATE public.user_companies  SET role = 'staff' WHERE role IS NULL OR role NOT IN ('owner', 'admin', 'manager', 'staff');
UPDATE public.company_invites SET role = 'staff' WHERE role IS NULL OR role NOT IN ('owner', 'admin', 'manager', 'staff');

ALTER TABLE public.company_invites ALTER COLUMN role SET DEFAULT 'staff';
ALTER TABLE public.user_companies  ALTER COLUMN role SET DEFAULT 'staff';
ALTER TABLE public.company_invites
  ADD CONSTRAINT company_invites_role_check CHECK (role IN ('owner', 'admin', 'manager', 'staff'));
ALTER TABLE public.user_companies
  ADD CONSTRAINT user_companies_role_check CHECK (role IN ('owner', 'admin', 'manager', 'staff'));

-- 3. Change a member role. SECURITY DEFINER because it writes another user
--    user_companies row; the caller must be the company owner or an admin.
--    The owner row is never changed, and nobody is made owner here.
CREATE OR REPLACE FUNCTION public.set_company_member_role(p_company_id uuid, p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_role NOT IN ('admin', 'manager', 'staff') THEN
    RAISE EXCEPTION 'Role must be admin, manager or staff';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_companies
     WHERE company_id = p_company_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.companies WHERE id = p_company_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to change roles in this company';
  END IF;

  IF EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.user_companies
                 WHERE company_id = p_company_id AND user_id = p_user_id AND role = 'owner') THEN
    RAISE EXCEPTION 'The owner role cannot be changed';
  END IF;

  UPDATE public.user_companies SET role = p_role
   WHERE company_id = p_company_id AND user_id = p_user_id;
  UPDATE public.company_invites SET role = p_role
   WHERE company_id = p_company_id AND accepted_by = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_company_member_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_member_role(uuid, uuid, text) TO authenticated;
