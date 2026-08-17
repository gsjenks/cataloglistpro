-- Deleting a sale must remove ALL of its data, not just the sales row. Previously
-- the app ran a bare `DELETE FROM sales`, relying on foreign-key cascades that may
-- not cover the older base tables (lots, photos, contacts, documents) — leaving
-- orphaned rows. This adds:
--   1. delete_sale(p_sale_id): a SECURITY DEFINER RPC that removes every child row
--      in child-first order, authorized to members of the sale's company.
--   2. A one-time cleanup of rows already orphaned by past sale/business deletes.
-- (Orphaned *storage files* are handled app-side before this RPC is called, and
-- can't be reached from SQL.)
-- Idempotent (safe to re-run).

-- ── 1. delete_sale RPC ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.sales WHERE id = p_sale_id;
  IF v_company IS NULL THEN
    RETURN; -- already gone (or never existed)
  END IF;

  -- Only a member (or owner) of the sale's company may delete it.
  IF NOT EXISTS (
        SELECT 1 FROM public.user_companies
        WHERE company_id = v_company AND user_id = auth.uid()
      )
     AND NOT EXISTS (
        SELECT 1 FROM public.companies WHERE id = v_company AND user_id = auth.uid()
      )
  THEN
    RAISE EXCEPTION 'Not authorized to delete this sale';
  END IF;

  -- Children first, so nothing is orphaned or blocked by a foreign key.
  DELETE FROM public.sales_transaction_items
    WHERE transaction_id IN (SELECT id FROM public.sales_transactions WHERE sale_id = p_sale_id);
  DELETE FROM public.sales_transactions WHERE sale_id = p_sale_id;
  DELETE FROM public.buyer_invoices WHERE sale_id = p_sale_id;      -- invoice lines are a jsonb column
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

GRANT EXECUTE ON FUNCTION public.delete_sale(uuid) TO authenticated;

-- ── 2. Clean up rows already orphaned by earlier deletes ─────────────────────
-- Photos whose lot no longer belongs to a live sale, then lots with no sale, then
-- sale-scoped contacts/documents with no sale, then dangling POS transactions.
DELETE FROM public.photos
  WHERE lot_id IN (
    SELECT id FROM public.lots WHERE sale_id IS NOT NULL AND sale_id NOT IN (SELECT id FROM public.sales)
  );
DELETE FROM public.photos WHERE lot_id NOT IN (SELECT id FROM public.lots);
DELETE FROM public.lots WHERE sale_id IS NOT NULL AND sale_id NOT IN (SELECT id FROM public.sales);
DELETE FROM public.contacts WHERE sale_id IS NOT NULL AND sale_id NOT IN (SELECT id FROM public.sales);
DELETE FROM public.documents WHERE sale_id IS NOT NULL AND sale_id NOT IN (SELECT id FROM public.sales);
DELETE FROM public.consignments WHERE sale_id IS NOT NULL AND sale_id NOT IN (SELECT id FROM public.sales);
DELETE FROM public.sales_transaction_items
  WHERE transaction_id NOT IN (SELECT id FROM public.sales_transactions);
DELETE FROM public.sales_transactions WHERE sale_id NOT IN (SELECT id FROM public.sales);
