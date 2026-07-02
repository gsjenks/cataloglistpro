-- Estate Sale POS — Phase 3: checkout transactions
-- A transaction (one checkout) has one or more line items (lots). Completing a
-- transaction marks each lot sold. Card tender is recorded but not processed
-- until Phase 4 (Square). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.sales_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id  uuid,
  subtotal    numeric(10,2) NOT NULL DEFAULT 0,
  tax         numeric(10,2) NOT NULL DEFAULT 0,
  total       numeric(10,2) NOT NULL DEFAULT 0,
  tender_type text NOT NULL CHECK (tender_type IN ('cash','check','venmo','cashapp','card','other')),
  status      text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided')),
  buyer_name  text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_transaction_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.sales_transactions(id) ON DELETE CASCADE,
  lot_id         uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  description    text,
  price          numeric(10,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_transactions_sale
  ON public.sales_transactions (sale_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_transaction_items_txn
  ON public.sales_transaction_items (transaction_id);

-- RLS: company members (via user_companies) can manage their transactions.
-- Mirrors the company-scoped access used elsewhere in the app.
ALTER TABLE public.sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_transaction_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS txn_company_members ON public.sales_transactions;
CREATE POLICY txn_company_members ON public.sales_transactions
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS txn_items_company_members ON public.sales_transaction_items;
CREATE POLICY txn_items_company_members ON public.sales_transaction_items
  FOR ALL
  USING (transaction_id IN (
    SELECT id FROM public.sales_transactions
    WHERE company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  ))
  WITH CHECK (transaction_id IN (
    SELECT id FROM public.sales_transactions
    WHERE company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
  ));
