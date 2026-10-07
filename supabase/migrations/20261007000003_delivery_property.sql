-- Delivery property type for the mover: a home, an apartment, or something
-- else (office, storage unit). It shapes parking, planning, access and how
-- far items are carried. NULL = not asked. Same three tables as the other
-- delivery_* columns. Apply BY HAND. Idempotent.

ALTER TABLE public.shoppers           ADD COLUMN IF NOT EXISTS delivery_property text;
ALTER TABLE public.sales_transactions ADD COLUMN IF NOT EXISTS delivery_property text;
ALTER TABLE public.lots               ADD COLUMN IF NOT EXISTS delivery_property text;

ALTER TABLE public.shoppers           DROP CONSTRAINT IF EXISTS shoppers_delivery_property_check;
ALTER TABLE public.sales_transactions DROP CONSTRAINT IF EXISTS sales_transactions_delivery_property_check;
ALTER TABLE public.lots               DROP CONSTRAINT IF EXISTS lots_delivery_property_check;
ALTER TABLE public.shoppers
  ADD CONSTRAINT shoppers_delivery_property_check CHECK (delivery_property IN ('home', 'apartment', 'other'));
ALTER TABLE public.sales_transactions
  ADD CONSTRAINT sales_transactions_delivery_property_check CHECK (delivery_property IN ('home', 'apartment', 'other'));
ALTER TABLE public.lots
  ADD CONSTRAINT lots_delivery_property_check CHECK (delivery_property IN ('home', 'apartment', 'other'));
