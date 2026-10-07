-- Movers: Certificate of Insurance (COI), the one-page summary proving the
-- mover has active insurance. Asked when a mover is added to the company
-- shippers/movers directory. coi_on_file NULL = not asked yet.
-- The certificate file goes to the private documents bucket under
-- <companyId>/coi/ (read by managers through signed URLs).
-- Apply BY HAND. Idempotent.

ALTER TABLE public.shippers
  ADD COLUMN IF NOT EXISTS coi_on_file boolean,
  ADD COLUMN IF NOT EXISTS coi_expires date,
  ADD COLUMN IF NOT EXISTS coi_path    text;
