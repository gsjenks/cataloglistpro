-- Hard-link a completed POS transaction to the shopper/basket it belongs to, so
-- the Shopper Baskets tab can mark a basket "checked out" by ID instead of
-- matching on the free-text buyer name. Nullable + ON DELETE SET NULL so
-- deleting a shopper never removes the financial record.
-- Idempotent (safe to re-run).

ALTER TABLE public.sales_transactions
  ADD COLUMN IF NOT EXISTS shopper_id uuid REFERENCES public.shoppers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_transactions_shopper
  ON public.sales_transactions (shopper_id);
