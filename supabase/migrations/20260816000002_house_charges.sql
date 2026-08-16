-- Charges the AUCTION HOUSE collects directly from a buyer: shipping, handling and
-- sales tax. Distinct from anything LiveAuctioneers collected (buyer_invoices), which
-- never touches the house's books.
--
-- Deliberately a separate table rather than more columns on buyer_invoices: that table
-- is a mirror of the LA PDF and gets re-imported/upserted whenever a corrected PDF
-- arrives, which would wipe hand-entered figures.
--
-- Keyed by buyer within a sale (buyer_key = buyer email, else name — the same grouping
-- the app uses everywhere else), so it also covers post-sale/aftersale purchases, which
-- have no LA invoice at all.
--
-- Idempotent (safe to re-run). Committing this file does not apply it; it runs on the
-- next `supabase db push`.

CREATE TABLE IF NOT EXISTS public.house_charges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid,          -- denormalized for RLS, matches app pattern
  sale_id         uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  buyer_key       text NOT NULL, -- buyer email, else name
  buyer_name      text,
  shipping        numeric NOT NULL DEFAULT 0,
  handling        numeric NOT NULL DEFAULT 0,
  tax_rate        numeric NOT NULL DEFAULT 0,   -- percent
  -- False when LiveAuctioneers already taxed the lots, leaving only the house's own
  -- shipping/handling taxable — otherwise the goods would be taxed twice.
  tax_includes_goods boolean NOT NULL DEFAULT true,
  -- Base the tax was actually charged on (goods, when included, + shipping + handling)
  -- and the resulting amount, both stored so a printed invoice can be reproduced later
  -- even if lots change afterwards.
  taxable_base    numeric NOT NULL DEFAULT 0,
  tax             numeric NOT NULL DEFAULT 0,
  -- Set when a resale certificate zeroed the tax (see the tax_exemptions work).
  tax_exempt      boolean NOT NULL DEFAULT false,
  exempt_reason   text,
  collected_at    timestamptz,
  payment_method  text,          -- cash | check | card | other
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_house_charges_sale_buyer
  ON public.house_charges (sale_id, buyer_key);
CREATE INDEX IF NOT EXISTS idx_house_charges_company ON public.house_charges (company_id);

-- RLS: company members manage their charges (mirrors consignments/shippers/buyer_invoices).
ALTER TABLE public.house_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS house_charges_company_members ON public.house_charges;
CREATE POLICY house_charges_company_members ON public.house_charges
  FOR ALL
  USING      (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
