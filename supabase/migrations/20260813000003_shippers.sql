-- Shippers directory (Stage 6) — a company-level list of shippers/handlers with
-- contact info (FedEx, USPS, Allied, crating & freight, in-house courier, …), so
-- packages can be assigned to a real shipper record and looked up later.
-- Lots reference the assigned handoff via lots.fulfillment_carrier, which holds
-- either a shipper id (uuid) or a built-in handoff ('pickup' | 'store').
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.shippers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid,
  name        text NOT NULL,
  kind        text,                         -- inhouse | external
  phone       text,
  email       text,
  address     text,
  notes       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shippers_company ON public.shippers (company_id);

ALTER TABLE public.shippers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shippers_company_members ON public.shippers;
CREATE POLICY shippers_company_members ON public.shippers
  FOR ALL
  USING      (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
