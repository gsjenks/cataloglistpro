-- Security Advisor warnings (2026-10-06), part 2.

-- 1. The documents bucket was PUBLIC with a broad SELECT policy: anyone with
--    the anon key could list it and download every contract and resale
--    certificate by its public URL. Make it private; the app already reads it
--    through createSignedUrl (DocumentsList, TaxExemptionService), and the
--    stored documents.file_url values stop working, which is the point.
update storage.buckets set public = false where id = 'documents';

-- 2. Drop the broad SELECT policies on all three buckets (remote-only, names
--    unknown, so matched on the bucket they name). Public URLs for photos and
--    company-assets do not need a SELECT policy; listing and download() do.
--    FOR ALL policies are left alone: dropping one would break uploads.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
      and (qual ilike '%''photos''%' or qual ilike '%''documents''%'
           or qual ilike '%''company-assets''%')
  loop
    raise notice 'dropping storage policy %', r.policyname;
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Staff read photos and logos (PhotoService.download, cache repair).
create policy "photos: signed-in read" on storage.objects
  for select to authenticated using (bucket_id = 'photos');

create policy "company-assets: signed-in read" on storage.objects
  for select to authenticated using (bucket_id = 'company-assets');

-- Documents: only members/owners of the company whose id is the first folder
-- (DocumentsList and TaxExemptionService both write <companyId>/...). Older
-- uploads under 'general/' and 'documents/' have no company; any signed-in
-- user may read those.
create policy "documents: company read" on storage.objects
  for select to authenticated using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] in ('general', 'documents')
      or (storage.foldername(name))[1] in (
        select company_id::text from public.user_companies where user_id = auth.uid()
        union
        select id::text from public.companies where user_id = auth.uid()
      )
    )
  );

-- 3. Function Search Path Mutable: pin search_path so a caller cannot shadow
--    public objects with their own (matters most for SECURITY DEFINER).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('retract_last_bid', 'get_unenriched_count',
                        'get_enrichment_stats', 'ensure_single_primary_photo',
                        'set_first_photo_as_primary', 'place_bid', 'advance_lot')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
  end loop;
end $$;
