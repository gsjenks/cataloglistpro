-- sale_baskets: associates a shopper's basket with a specific sale, so the
-- Shopper Baskets tab can list EVERY basket for a sale — including empty ones —
-- not just shoppers currently holding a live lot. Shoppers are company-wide
-- (no sale_id of their own), so without this link an empty/checked-out basket
-- has nothing tying it to the sale it was worked in.
--
-- Stamped (upserted) whenever a basket is opened or used in a sale: created,
-- an item held/added, or opened from the basket tool / register.
-- Idempotent (safe to re-run).

CREATE TABLE IF NOT EXISTS public.sale_baskets (
  sale_id    uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  shopper_id uuid NOT NULL REFERENCES public.shoppers(id) ON DELETE CASCADE,
  company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sale_id, shopper_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_baskets_sale ON public.sale_baskets (sale_id);

ALTER TABLE public.sale_baskets ENABLE ROW LEVEL SECURITY;

-- Scope through the sale's company membership (robust even if the client omits
-- company_id on write).
DROP POLICY IF EXISTS sale_baskets_company_members ON public.sale_baskets;
CREATE POLICY sale_baskets_company_members ON public.sale_baskets
  FOR ALL
  USING (
    sale_id IN (
      SELECT id FROM public.sales
      WHERE company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    sale_id IN (
      SELECT id FROM public.sales
      WHERE company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
    )
  );
