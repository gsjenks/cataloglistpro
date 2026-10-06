-- Security Advisor errors (2026-10-06). None of these objects are referenced by
-- the app, an edge function or another migration; they exist only remotely.

-- 1. SECURITY DEFINER views. They ran as their owner, so anon could read every
--    photo row joined to lot_name / lot_number / sale_name, bypassing the lots
--    and sales RLS tightened in 20261004*. Run them as the caller instead.
alter view public.enriched_photos   set (security_invoker = true);
alter view public.unenriched_photos set (security_invoker = true);
alter view public.primary_photos    set (security_invoker = true);

revoke all on public.enriched_photos, public.unenriched_photos, public.primary_photos from anon;

-- 2. Legacy tables with RLS off (all empty). With RLS off, anon could insert,
--    update and delete through PostgREST. Enable RLS with no policies: closed
--    to anon/authenticated, service_role still bypasses.
alter table public.consignors    enable row level security;
alter table public.invoices      enable row level security;
alter table public.tenants       enable row level security;
alter table public.invoice_items enable row level security;

revoke all on public.consignors, public.invoices, public.tenants, public.invoice_items from anon, authenticated;
