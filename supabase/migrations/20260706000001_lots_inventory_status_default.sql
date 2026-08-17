-- Every lot should have an inventory status. Catalog lots created before the
-- estate-sale columns existed (or via the catalog flow) have a NULL status,
-- which made status filters unreliable (NULL <> 'sold' is NULL, not true, so
-- those lots were silently excluded from item searches).
--   1. Backfill existing NULLs to 'available'.
--   2. Default new rows to 'available'.
--   3. Enforce NOT NULL now that every row has a value.
-- Idempotent (safe to re-run).

UPDATE public.lots SET inventory_status = 'available' WHERE inventory_status IS NULL;

ALTER TABLE public.lots ALTER COLUMN inventory_status SET DEFAULT 'available';

ALTER TABLE public.lots ALTER COLUMN inventory_status SET NOT NULL;
