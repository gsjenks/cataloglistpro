-- Role enforcement in the database (src/lib/roles.ts). Before this, the staff
-- limits existed only in the UI. Policies below are RESTRICTIVE: they are ANDed
-- with the existing company-member policies, which are left as they are, so
-- they can only take access away. Requires 20261007000000_staff_roles.sql.
-- Apply BY HAND. No apostrophes in comments: the dashboard editor mis-splits
-- on them. Idempotent.
--
-- Managers (owner, admin, manager) only:
--   sales            create, edit (details, stage, checklist), delete
--   lots             delete
--   sales_transactions, sales_transaction_items   create and delete (the register)
--   refunds, house_charges, buyer_invoices         everything (money)
--   consignments     create, edit, delete (client terms, payouts)
--   documents        everything, and reading files in the documents bucket
--   tax_exemptions   everything
--   sale_rooms       rename, reorder, delete (room capture still adds rooms)
--   delete_sale()    the RPC
-- Staff keep: reading sales, lots, transactions; creating and editing lots;
-- editing transactions (delivery details); holds, baskets, shoppers, photos.
-- Membership rows: only the company owner may edit them directly (staff could
-- previously edit their own row, including its role).

-- 1. Helpers. SECURITY DEFINER so policies can ask without recursing into RLS.
CREATE OR REPLACE FUNCTION public.is_company_manager(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.user_companies
                  WHERE company_id = p_company_id AND user_id = auth.uid()
                    AND role IN ('owner', 'admin', 'manager'));
$$;

CREATE OR REPLACE FUNCTION public.is_sale_manager(p_sale_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_company_manager((SELECT company_id FROM public.sales WHERE id = p_sale_id));
$$;

REVOKE EXECUTE ON FUNCTION public.is_company_manager(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_sale_manager(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_company_manager(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_sale_manager(uuid)    TO authenticated;

-- 2. Restrictive policies.
DROP POLICY IF EXISTS sales_managers_insert ON public.sales;
DROP POLICY IF EXISTS sales_managers_update ON public.sales;
DROP POLICY IF EXISTS sales_managers_delete ON public.sales;
CREATE POLICY sales_managers_insert ON public.sales AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_company_manager(company_id));
CREATE POLICY sales_managers_update ON public.sales AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_company_manager(company_id)) WITH CHECK (public.is_company_manager(company_id));
CREATE POLICY sales_managers_delete ON public.sales AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_company_manager(company_id));

DROP POLICY IF EXISTS lots_managers_delete ON public.lots;
CREATE POLICY lots_managers_delete ON public.lots AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_sale_manager(sale_id));

DROP POLICY IF EXISTS txn_managers_insert ON public.sales_transactions;
DROP POLICY IF EXISTS txn_managers_delete ON public.sales_transactions;
CREATE POLICY txn_managers_insert ON public.sales_transactions AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_company_manager(company_id));
CREATE POLICY txn_managers_delete ON public.sales_transactions AS RESTRICTIVE FOR DELETE
  USING (public.is_company_manager(company_id));

DROP POLICY IF EXISTS txn_items_managers_insert ON public.sales_transaction_items;
DROP POLICY IF EXISTS txn_items_managers_delete ON public.sales_transaction_items;
CREATE POLICY txn_items_managers_insert ON public.sales_transaction_items AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_company_manager((SELECT t.company_id FROM public.sales_transactions t WHERE t.id = transaction_id)));
CREATE POLICY txn_items_managers_delete ON public.sales_transaction_items AS RESTRICTIVE FOR DELETE
  USING (public.is_company_manager((SELECT t.company_id FROM public.sales_transactions t WHERE t.id = transaction_id)));

DROP POLICY IF EXISTS refunds_managers ON public.refunds;
CREATE POLICY refunds_managers ON public.refunds AS RESTRICTIVE FOR ALL
  USING (public.is_sale_manager(sale_id)) WITH CHECK (public.is_sale_manager(sale_id));

DROP POLICY IF EXISTS house_charges_managers ON public.house_charges;
CREATE POLICY house_charges_managers ON public.house_charges AS RESTRICTIVE FOR ALL
  USING (public.is_company_manager(company_id)) WITH CHECK (public.is_company_manager(company_id));

DROP POLICY IF EXISTS buyer_invoices_managers ON public.buyer_invoices;
CREATE POLICY buyer_invoices_managers ON public.buyer_invoices AS RESTRICTIVE FOR ALL
  USING (public.is_company_manager(company_id)) WITH CHECK (public.is_company_manager(company_id));

DROP POLICY IF EXISTS tax_exemptions_managers ON public.tax_exemptions;
CREATE POLICY tax_exemptions_managers ON public.tax_exemptions AS RESTRICTIVE FOR ALL
  USING (public.is_company_manager(company_id)) WITH CHECK (public.is_company_manager(company_id));

DROP POLICY IF EXISTS consignments_managers_insert ON public.consignments;
DROP POLICY IF EXISTS consignments_managers_update ON public.consignments;
DROP POLICY IF EXISTS consignments_managers_delete ON public.consignments;
CREATE POLICY consignments_managers_insert ON public.consignments AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.is_company_manager(company_id));
CREATE POLICY consignments_managers_update ON public.consignments AS RESTRICTIVE FOR UPDATE
  USING (public.is_company_manager(company_id)) WITH CHECK (public.is_company_manager(company_id));
CREATE POLICY consignments_managers_delete ON public.consignments AS RESTRICTIVE FOR DELETE
  USING (public.is_company_manager(company_id));

DROP POLICY IF EXISTS documents_managers ON public.documents;
CREATE POLICY documents_managers ON public.documents AS RESTRICTIVE FOR ALL
  USING (public.is_company_manager(COALESCE(company_id, (SELECT s.company_id FROM public.sales s WHERE s.id = sale_id))))
  WITH CHECK (public.is_company_manager(COALESCE(company_id, (SELECT s.company_id FROM public.sales s WHERE s.id = sale_id))));

DROP POLICY IF EXISTS sale_rooms_managers_update ON public.sale_rooms;
DROP POLICY IF EXISTS sale_rooms_managers_delete ON public.sale_rooms;
CREATE POLICY sale_rooms_managers_update ON public.sale_rooms AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_sale_manager(sale_id)) WITH CHECK (public.is_sale_manager(sale_id));
CREATE POLICY sale_rooms_managers_delete ON public.sale_rooms AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_sale_manager(sale_id));

-- 3. Membership rows: no more editing your own role.
DROP POLICY IF EXISTS user_companies_update_v2 ON public.user_companies;
DROP POLICY IF EXISTS user_companies_update_owner ON public.user_companies;
CREATE POLICY user_companies_update_owner ON public.user_companies FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid()));

-- Invites can no longer hand out owner (claim_company_invites copies the role).
ALTER TABLE public.company_invites DROP CONSTRAINT IF EXISTS company_invites_role_check;
ALTER TABLE public.company_invites
  ADD CONSTRAINT company_invites_role_check CHECK (role IN ('admin', 'manager', 'staff'));

-- 4. delete_sale: managers only (it bypasses RLS, so it checks for itself).
CREATE OR REPLACE FUNCTION public.delete_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.sales WHERE id = p_sale_id;
  IF v_company IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_company_manager(v_company) THEN
    RAISE EXCEPTION 'Only an owner, admin or manager can delete a sale';
  END IF;

  DELETE FROM public.sales_transaction_items
    WHERE transaction_id IN (SELECT id FROM public.sales_transactions WHERE sale_id = p_sale_id);
  DELETE FROM public.sales_transactions WHERE sale_id = p_sale_id;
  DELETE FROM public.buyer_invoices WHERE sale_id = p_sale_id;
  DELETE FROM public.house_charges WHERE sale_id = p_sale_id;
  DELETE FROM public.consignments WHERE sale_id = p_sale_id;
  DELETE FROM public.photos
    WHERE lot_id IN (SELECT id FROM public.lots WHERE sale_id = p_sale_id);
  DELETE FROM public.lots WHERE sale_id = p_sale_id;
  DELETE FROM public.contacts WHERE sale_id = p_sale_id;
  DELETE FROM public.documents WHERE sale_id = p_sale_id;
  DELETE FROM public.sales WHERE id = p_sale_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_sale(uuid) TO authenticated;

-- 5. Storage reads. 20261006000002 dropped the broad SELECT policies but its
--    replacements never reached the remote project, which left no SELECT
--    policy on storage.objects at all: signed URLs for documents failed, and
--    photo remove/upsert (which need SELECT) failed quietly.
DROP POLICY IF EXISTS "photos: signed-in read" ON storage.objects;
DROP POLICY IF EXISTS "company-assets: signed-in read" ON storage.objects;
DROP POLICY IF EXISTS "documents: company read" ON storage.objects;
DROP POLICY IF EXISTS "documents: managers read" ON storage.objects;

CREATE POLICY "photos: signed-in read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'photos');

CREATE POLICY "company-assets: signed-in read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'company-assets');

-- Contracts and resale certificates: managers of the company in the first
-- folder. Older uploads under general/ and documents/ have no company; any
-- manager may read those.
CREATE POLICY "documents: managers read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'documents'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM public.user_companies
         WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
        UNION
        SELECT id::text FROM public.companies WHERE user_id = auth.uid()
      )
      OR (
        (storage.foldername(name))[1] IN ('general', 'documents')
        AND (
          EXISTS (SELECT 1 FROM public.user_companies
                   WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager'))
          OR EXISTS (SELECT 1 FROM public.companies WHERE user_id = auth.uid())
        )
      )
    )
  );
