-- Team management — let an owner/admin remove a member (revoke access).
-- SECURITY DEFINER so it can delete another user's user_companies row after
-- verifying the caller is an owner/admin of that company.

CREATE OR REPLACE FUNCTION public.remove_company_member(p_company_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_companies
    WHERE company_id = p_company_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to remove members from this company';
  END IF;

  DELETE FROM public.user_companies
    WHERE company_id = p_company_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_company_member(uuid, uuid) TO authenticated;
