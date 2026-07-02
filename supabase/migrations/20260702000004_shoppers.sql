-- Estate Sale — shopper identity + verification
-- A company-level shopper directory so a buyer's basket follows the PERSON, not
-- the browser. Basket keys to shopper id (lots.held_by = shopper id). Codes are
-- issued/checked only by the shopper-verify Edge Function (service role); these
-- tables are not directly writable by anonymous buyers.

CREATE TABLE IF NOT EXISTS public.shoppers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid,
  name           text NOT NULL,
  email          text,
  phone          text,
  email_verified boolean NOT NULL DEFAULT false,
  phone_verified boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Must provide at least one contact channel.
  CONSTRAINT shoppers_contact_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_shoppers_company_phone ON public.shoppers (company_id, phone);
CREATE INDEX IF NOT EXISTS idx_shoppers_company_email ON public.shoppers (company_id, email);
-- Trigram-ish lookups by name are fine with a plain index for small directories.
CREATE INDEX IF NOT EXISTS idx_shoppers_company_name ON public.shoppers (company_id, name);

CREATE TABLE IF NOT EXISTS public.shopper_verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopper_id  uuid NOT NULL REFERENCES public.shoppers(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('email','sms')),
  destination text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopper_verif_shopper ON public.shopper_verifications (shopper_id, created_at DESC);

-- RLS: staff (company members) can read/manage their shopper directory. The
-- Edge Function uses the service role and bypasses RLS. Verifications have no
-- policies, so only the service role can touch them.
ALTER TABLE public.shoppers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopper_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shoppers_company_members ON public.shoppers;
CREATE POLICY shoppers_company_members ON public.shoppers
  FOR ALL
  USING (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
