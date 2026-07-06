-- Persistent delivery tagging + mover details, so the delivery workflow spans
-- both the sales floor (basket tool) and the register.
--   • lots.for_delivery — per-item "this item is going out for delivery" flag.
--     Floor staff tag it; register staff see/adjust it. Persists on the item.
--   • shoppers.delivery_* — the customer's mover/delivery details (one delivery
--     per customer): address, date, estimate, and the mover company + contacts.
--     Collected on the floor, pre-filled and confirmed at the register.
-- Idempotent (safe to re-run).

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS for_delivery boolean NOT NULL DEFAULT false;

ALTER TABLE public.shoppers
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_date text,
  ADD COLUMN IF NOT EXISTS delivery_estimate text,
  ADD COLUMN IF NOT EXISTS delivery_company text,
  ADD COLUMN IF NOT EXISTS delivery_company_phone text,
  ADD COLUMN IF NOT EXISTS delivery_company_email text;
