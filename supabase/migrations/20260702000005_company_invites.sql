-- Team management — company invites (invite by email, claimed on login)
-- An owner/admin invites a teammate by email + role. When that person logs in,
-- claim_company_invites() (SECURITY DEFINER) converts matching pending invites
-- into user_companies memberships.

CREATE TABLE IF NOT EXISTS public.company_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  invited_by  uuid,
  accepted_by uuid,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_invites_company ON public.company_invites (company_id);
CREATE INDEX IF NOT EXISTS idx_company_invites_email ON public.company_invites (lower(email));

-- Company members manage their own company's invites. The invitee doesn't read
-- this table directly — claiming happens via the definer RPC below.
ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invites_company_members ON public.company_invites;
CREATE POLICY invites_company_members ON public.company_invites
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

-- Claim all pending invites for the calling user's email → add memberships.
CREATE OR REPLACE FUNCTION public.claim_company_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_count int := 0;
  r       record;
BEGIN
  IF v_uid IS NULL OR v_email IS NULL THEN RETURN 0; END IF;

  FOR r IN
    SELECT * FROM public.company_invites
    WHERE status = 'pending' AND lower(email) = v_email
  LOOP
    INSERT INTO public.user_companies (user_id, company_id, role)
      SELECT v_uid, r.company_id, r.role
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_companies uc
        WHERE uc.user_id = v_uid AND uc.company_id = r.company_id
      );
    UPDATE public.company_invites
      SET status = 'accepted', accepted_by = v_uid
      WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_company_invites() TO authenticated;
