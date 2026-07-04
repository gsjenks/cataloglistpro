-- Team permissions: only owners/admins may create/change/remove invites.
-- Previously the single FOR ALL policy let ANY company member write invites,
-- so a member could invite an accomplice as admin (privilege escalation).
-- Members keep SELECT (they can view the team); writes are owner/admin only.
-- claim_company_invites() is SECURITY DEFINER, so accepting invites still works.

DROP POLICY IF EXISTS invites_company_members ON public.company_invites;

CREATE POLICY invites_select ON public.company_invites
  FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

CREATE POLICY invites_insert ON public.company_invites
  FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.user_companies
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

CREATE POLICY invites_update ON public.company_invites
  FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM public.user_companies
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

CREATE POLICY invites_delete ON public.company_invites
  FOR DELETE
  USING (company_id IN (
    SELECT company_id FROM public.user_companies
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));
