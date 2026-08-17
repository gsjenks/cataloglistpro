-- Audit trail for refunds. Refunding a sold lot reverses its POS transaction in
-- place (see RefundService), which would otherwise leave no record of what was
-- given back. Each refund is logged here: the item, amount, buyer, and reason.
-- Idempotent (safe to re-run).

CREATE TABLE IF NOT EXISTS public.refunds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id     uuid,
  lot_id         uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  lot_name       text,
  lot_number     text,
  amount         numeric(10,2) NOT NULL DEFAULT 0,
  buyer_name     text,
  transaction_id uuid,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_sale ON public.refunds (sale_id, created_at DESC);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refunds_company_members ON public.refunds;
CREATE POLICY refunds_company_members ON public.refunds
  FOR ALL
  USING (
    sale_id IN (SELECT id FROM public.sales
      WHERE company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    sale_id IN (SELECT id FROM public.sales
      WHERE company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  );
