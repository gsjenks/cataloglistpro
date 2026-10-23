-- Lot appraisals: the appraised value, the appraisal document it came from (a
-- sale document of type 'appraisal'), the appraiser (a contact) and the date of
-- the appraisal. All NULL = not appraised. Staff-side only: never add these to
-- the public read functions (public_sale_lots / public_lot). Deleting the
-- document or the contact leaves the value and clears the link.
-- Apply BY HAND. Idempotent.

ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS appraised_value       numeric(12,2);
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS appraisal_date        date;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS appraisal_document_id uuid;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS appraiser_contact_id  uuid;

ALTER TABLE public.lots DROP CONSTRAINT IF EXISTS lots_appraisal_document_id_fkey;
ALTER TABLE public.lots DROP CONSTRAINT IF EXISTS lots_appraiser_contact_id_fkey;
ALTER TABLE public.lots
  ADD CONSTRAINT lots_appraisal_document_id_fkey
  FOREIGN KEY (appraisal_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;
ALTER TABLE public.lots
  ADD CONSTRAINT lots_appraiser_contact_id_fkey
  FOREIGN KEY (appraiser_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.lots DROP CONSTRAINT IF EXISTS lots_appraised_value_check;
ALTER TABLE public.lots
  ADD CONSTRAINT lots_appraised_value_check CHECK (appraised_value IS NULL OR appraised_value >= 0);
