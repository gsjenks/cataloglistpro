-- Room capture on the server: walkthrough clips upload to storage and the
-- room-capture edge function analyses them in the background, so the crew can
-- film the next room while the last one processes. See docs/room-capture-spec.md.
--
--   room_capture_jobs   one per room filmed. status:
--                         recording      clips still being added
--                         processing     room finished, clips still running
--                         consolidating  merging the clips into one lot list
--                         ready          waiting for review
--                         failed         no clip could be analysed
--                         imported       lots created; videos deleted
--   room_capture_clips  one per video. status:
--                         uploading -> uploaded -> transferring (to Gemini)
--                         -> waiting (Gemini preparing it) -> analyzing -> done
--                         or failed. result = the analysis (items, transcript).
--   lease_until         a running step owns the row until then; a stalled step
--                       is picked up again once it lapses.
--
-- Videos go in the private room-capture bucket under
-- <companyId>/<saleId>/<jobId>/<clipId>.<ext>.
--
-- Apply BY HAND (SQL editor). No apostrophes in comments: the dashboard editor
-- mis-splits on them. Idempotent (safe to re-run).
-- Also raise the global upload limit (Storage, Settings) to at least 2 GB.

CREATE TABLE IF NOT EXISTS public.room_capture_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id      uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  room_id      uuid REFERENCES public.sale_rooms(id) ON DELETE SET NULL,
  room_code    text,
  room_name    text NOT NULL DEFAULT '',
  sale_context text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'recording'
               CHECK (status IN ('recording', 'processing', 'consolidating', 'ready', 'failed', 'imported')),
  merged       jsonb,
  error        text,
  lease_until  timestamptz,
  finished_at  timestamptz,
  imported_at  timestamptz,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_capture_jobs_sale ON public.room_capture_jobs (sale_id, status);

CREATE TABLE IF NOT EXISTS public.room_capture_clips (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL REFERENCES public.room_capture_jobs(id) ON DELETE CASCADE,
  seq                int  NOT NULL DEFAULT 0,
  file_name          text NOT NULL DEFAULT '',
  storage_path       text NOT NULL,
  size               bigint NOT NULL DEFAULT 0,
  mime_type          text NOT NULL DEFAULT 'video/mp4',
  status             text NOT NULL DEFAULT 'uploading'
                     CHECK (status IN ('uploading', 'uploaded', 'transferring', 'waiting', 'analyzing', 'done', 'failed')),
  gemini_upload_url  text,
  gemini_offset      bigint NOT NULL DEFAULT 0,
  gemini_file        text,
  gemini_uri         text,
  result             jsonb,
  error              text,
  attempts           int NOT NULL DEFAULT 0,
  lease_until        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_capture_clips_job ON public.room_capture_clips (job_id, seq);

ALTER TABLE public.room_capture_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_capture_clips ENABLE ROW LEVEL SECURITY;

-- Any member of the company (staff included: they film rooms).
DROP POLICY IF EXISTS room_capture_jobs_members ON public.room_capture_jobs;
CREATE POLICY room_capture_jobs_members ON public.room_capture_jobs
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
    OR company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS room_capture_clips_members ON public.room_capture_clips;
CREATE POLICY room_capture_clips_members ON public.room_capture_clips
  FOR ALL TO authenticated
  USING (
    job_id IN (
      SELECT j.id FROM public.room_capture_jobs j
       WHERE j.company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
          OR j.company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT j.id FROM public.room_capture_jobs j
       WHERE j.company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
          OR j.company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
    )
  );

REVOKE ALL ON public.room_capture_jobs  FROM anon;
REVOKE ALL ON public.room_capture_clips FROM anon;

-- Private bucket for the clips. No per-bucket size cap: the global upload
-- limit (Storage, Settings) applies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-capture', 'room-capture', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "room-capture: members read"   ON storage.objects;
DROP POLICY IF EXISTS "room-capture: members write"  ON storage.objects;
DROP POLICY IF EXISTS "room-capture: members update" ON storage.objects;
DROP POLICY IF EXISTS "room-capture: members delete" ON storage.objects;

CREATE POLICY "room-capture: members read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'room-capture'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.user_companies WHERE user_id = auth.uid()
      UNION
      SELECT id::text FROM public.companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "room-capture: members write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'room-capture'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.user_companies WHERE user_id = auth.uid()
      UNION
      SELECT id::text FROM public.companies WHERE user_id = auth.uid()
    )
  );

-- Resumable uploads with x-upsert need UPDATE as well as INSERT.
CREATE POLICY "room-capture: members update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'room-capture'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.user_companies WHERE user_id = auth.uid()
      UNION
      SELECT id::text FROM public.companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "room-capture: members delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'room-capture'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.user_companies WHERE user_id = auth.uid()
      UNION
      SELECT id::text FROM public.companies WHERE user_id = auth.uid()
    )
  );
