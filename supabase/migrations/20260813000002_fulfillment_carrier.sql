-- Fulfillment carrier/handler (Stage 6) — which shipper or handoff a lot goes out
-- via, so packages can be separated by carrier (FedEx, USPS, Allied, crating/freight,
-- in-house, pickup, store, …). Complements fulfillment_method (ship|pickup).
-- Idempotent.

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS fulfillment_carrier text;
