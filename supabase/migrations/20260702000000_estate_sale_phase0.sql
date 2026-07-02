-- Estate Sale POS — Phase 0 foundation
-- Adds the sale-type branch, buyer self-checkout settings (incl. the delay
-- mechanism), and floor inventory status. Safe to re-run (IF NOT EXISTS).
--
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- Sales: estate-sale vs auction + self-checkout controls
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'auction'
    CHECK (sale_type IN ('estate_sale', 'auction'));

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS online_checkout_enabled boolean NOT NULL DEFAULT false;

-- NULL = self-checkout opens immediately once enabled. A future timestamp is the
-- in-person priority window: online buyers cannot purchase until this passes.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS online_checkout_opens_at timestamptz;

-- Lots: floor inventory state (staff-controlled, not gated by the delay above)
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS inventory_status text NOT NULL DEFAULT 'available'
    CHECK (inventory_status IN ('available', 'held', 'sold'));

-- Fast lookups of what is still available on the floor for a given sale
CREATE INDEX IF NOT EXISTS idx_lots_sale_inventory_status
  ON public.lots (sale_id, inventory_status);
