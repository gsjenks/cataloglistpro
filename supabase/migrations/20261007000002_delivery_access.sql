-- Delivery access questions for the mover: will they carry items up or down
-- stairs, and is an elevator needed. Asked with the rest of the delivery
-- details (basket, register, Fulfillment) and printed on the mover manifest.
-- NULL = not asked yet. Same three places as the other delivery_* columns:
-- the shopper (floor), the transaction (register) and the lot (no transaction).
-- Apply BY HAND. Idempotent.

ALTER TABLE public.shoppers
  ADD COLUMN IF NOT EXISTS delivery_stairs   boolean,
  ADD COLUMN IF NOT EXISTS delivery_elevator boolean;

ALTER TABLE public.sales_transactions
  ADD COLUMN IF NOT EXISTS delivery_stairs   boolean,
  ADD COLUMN IF NOT EXISTS delivery_elevator boolean;

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS delivery_stairs   boolean,
  ADD COLUMN IF NOT EXISTS delivery_elevator boolean;
