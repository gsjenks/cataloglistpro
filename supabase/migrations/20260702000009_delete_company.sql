-- Delete a business and ALL of its data (owner only). SECURITY DEFINER so it can
-- remove rows across tables regardless of RLS. Children deleted before parents.
-- NOTE: this removes DB rows; orphaned photo files in storage are not deleted.

CREATE OR REPLACE FUNCTION public.delete_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the company owner may delete the whole business.
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND user_id = auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.user_companies
       WHERE company_id = p_company_id AND user_id = auth.uid() AND role = 'owner'
     ) THEN
    RAISE EXCEPTION 'Not authorized to delete this company';
  END IF;

  DELETE FROM public.sales_transaction_items
    WHERE transaction_id IN (SELECT id FROM public.sales_transactions WHERE company_id = p_company_id);
  DELETE FROM public.sales_transactions WHERE company_id = p_company_id;
  DELETE FROM public.photos
    WHERE lot_id IN (
      SELECT l.id FROM public.lots l JOIN public.sales s ON l.sale_id = s.id
      WHERE s.company_id = p_company_id
    );
  DELETE FROM public.lots
    WHERE sale_id IN (SELECT id FROM public.sales WHERE company_id = p_company_id);
  DELETE FROM public.contacts
    WHERE company_id = p_company_id
       OR sale_id IN (SELECT id FROM public.sales WHERE company_id = p_company_id);
  DELETE FROM public.documents
    WHERE company_id = p_company_id
       OR sale_id IN (SELECT id FROM public.sales WHERE company_id = p_company_id);
  DELETE FROM public.sales WHERE company_id = p_company_id;
  DELETE FROM public.lookup_categories WHERE company_id = p_company_id;
  DELETE FROM public.company_invites WHERE company_id = p_company_id;
  DELETE FROM public.shoppers WHERE company_id = p_company_id;
  DELETE FROM public.user_companies WHERE company_id = p_company_id;
  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_company(uuid) TO authenticated;
