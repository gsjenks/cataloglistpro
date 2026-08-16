-- Buyer invoices imported from the LiveAuctioneers end-of-auction invoice PDF.
-- Tax, shipping and the online-payments fee exist ONLY on that document — the EOA
-- XML carries hammer + premium and nothing else — so this is the authoritative
-- record of what each buyer was actually billed and what they still owe.
--
-- One row per (sale, LA invoice). Lots join on lots.la_invoice_id (set by the EOA
-- import, 20260813000001). Per-lot amounts stay on lots; this holds the
-- buyer-level money that would otherwise be duplicated across every lot.
--
-- Idempotent (safe to re-run). Committing this file does not apply it; it runs on
-- the next `supabase db push`.

CREATE TABLE IF NOT EXISTS public.buyer_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid,          -- denormalized for RLS, matches app pattern
  sale_id         uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  la_invoice_id   text NOT NULL,
  status          text,          -- paid | unpaid (as printed by LA)
  buyer_name      text,
  buyer_email     text,
  buyer_phone     text,
  ship_to         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {lines[], address, city, state, zip, country}
  shipping_method text,
  hammer_total    numeric,
  premium_total   numeric,
  shipping        numeric,
  online_fee      numeric,       -- LA's estimated online-payments fee
  sales_tax       numeric,
  total           numeric,
  balance_due     numeric,
  payment_method  text,
  paid_at_text    text,          -- LA prints a local-time string, kept verbatim
  lot_numbers     integer[],     -- lots billed on this invoice
  -- False when the printed total doesn't equal lots + shipping + fee + tax, which
  -- happens when LA revises an invoice (e.g. shipping added after it was totalled).
  totals_balance  boolean NOT NULL DEFAULT true,
  imported_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_invoices_sale_invoice
  ON public.buyer_invoices (sale_id, la_invoice_id);
CREATE INDEX IF NOT EXISTS idx_buyer_invoices_company ON public.buyer_invoices (company_id);

-- RLS: company members manage their invoices (mirrors consignments/shippers).
ALTER TABLE public.buyer_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buyer_invoices_company_members ON public.buyer_invoices;
CREATE POLICY buyer_invoices_company_members ON public.buyer_invoices
  FOR ALL
  USING      (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid()));
