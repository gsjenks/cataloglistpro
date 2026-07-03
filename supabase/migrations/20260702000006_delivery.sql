-- Estate Sale POS — delivery / fulfillment
-- Delivery details live on the transaction; each line item is tagged carry
-- (taken home now) or delivery (needs delivery/pickup). Safe to re-run.

ALTER TABLE public.sales_transactions
  ADD COLUMN IF NOT EXISTS delivery_address       text,
  ADD COLUMN IF NOT EXISTS delivery_date          text,
  ADD COLUMN IF NOT EXISTS delivery_estimate      text,
  ADD COLUMN IF NOT EXISTS delivery_company       text,
  ADD COLUMN IF NOT EXISTS delivery_company_phone text,
  ADD COLUMN IF NOT EXISTS delivery_company_email text;

ALTER TABLE public.sales_transaction_items
  ADD COLUMN IF NOT EXISTS fulfillment text NOT NULL DEFAULT 'carry'
    CHECK (fulfillment IN ('carry', 'delivery'));
