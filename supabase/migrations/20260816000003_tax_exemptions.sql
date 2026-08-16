-- Resale / sales-tax exemption certificates, so a dealer isn't charged house sales
-- tax and the exemption is defensible in an audit.
--
-- Company-scoped and NOT tied to a sale: a dealer who buys from you three times a year
-- is entered once and found again automatically. Keyed by buyer_key (buyer email, else
-- name) to match house_charges and the LA buyer records, with an optional contact_id
-- for walk-in / estate-sale buyers who exist in contacts.
--
-- The photographed or uploaded certificate lives in the private `documents` storage
-- bucket (signed URLs only); image_path is its object path.
--
-- Idempotent (safe to re-run). Committing this file does not apply it; it runs on the
-- next `supabase db push`.

CREATE TABLE IF NOT EXISTS public.tax_exemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid,          -- denormalized for RLS, matches app pattern
  contact_id     uuid,          -- optional link to public.contacts
  buyer_key      text NOT NULL, -- buyer email, else name
  buyer_name     text,
  business_name  text,
  state          text,          -- issuing state; a dealer may hold several
  permit_number  text,
  issued_on      date,
  expires_on     date,          -- NULL = no stated expiry
  image_path     text,          -- object path in the private `documents` bucket
  image_name     text,
  note           text,
  verified_at    timestamptz,
  verified_by    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One certificate per buyer per issuing state.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_exemptions_buyer_state
  ON public.tax_exemptions (company_id, buyer_key, coalesce(state, ''));
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_company ON public.tax_exemptions (company_id);

-- RLS: company members manage their certificates.
ALTER TABLE public.tax_exemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_exemptions_company_members ON public.tax_exemptions;
CREATE POLICY tax_exemptions_company_members ON public.tax_exemptions
  FOR ALL
  USING      (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
