-- Security hardening — close write-side RLS gaps so a removed member (or another
-- tenant, or anon) cannot modify a company's data.
--
-- Audit findings (2026-07-02): most tables gate writes on user_companies
-- membership, BUT:
--   • photos had wide-open "authenticated can do anything" policies (ALL true) —
--     cross-tenant view/insert/update/delete of any photo.
--   • user_companies INSERT check was `true` — an authenticated user could grant
--     themselves membership to ANY company (privilege escalation).
--   • companies INSERT check was `true`.

-- 1) photos: drop the wide-open policies; keep public READ + member-only writes.
DROP POLICY IF EXISTS "Allow authenticated users full access to photos" ON public.photos;
DROP POLICY IF EXISTS "Users can delete photos" ON public.photos;
DROP POLICY IF EXISTS "Users can insert photos" ON public.photos;
DROP POLICY IF EXISTS "Users can update photos" ON public.photos;
DROP POLICY IF EXISTS "Users can view photos"   ON public.photos;
-- Kept: "Public read photos" (buyer pages) and
--       "Users can {view,insert,update,delete} photos in their companies".

-- 2) user_companies: restrict INSERT to adding yourself to a company you own.
--    Team invites use claim_company_invites() (SECURITY DEFINER, bypasses RLS).
DROP POLICY IF EXISTS user_companies_insert_v2 ON public.user_companies;
CREATE POLICY user_companies_insert_v2 ON public.user_companies
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  );

-- 3) companies: only allow creating a company owned by yourself.
DROP POLICY IF EXISTS companies_insert_v2 ON public.companies;
CREATE POLICY companies_insert_v2 ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
