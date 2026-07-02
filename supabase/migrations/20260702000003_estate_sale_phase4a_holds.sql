-- Estate Sale POS — Phase 4a: buyer basket holds
-- Adds a 30-minute hold when a buyer adds an item to their basket. Holds are
-- placed/released via SECURITY DEFINER RPCs so anonymous buyers can hold items
-- without granting broad write access to the lots table. Safe to re-run.

ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS held_until timestamptz;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS held_by text; -- buyer basket id

-- Place (or refresh) a 30-minute hold for a basket on an available item.
CREATE OR REPLACE FUNCTION public.hold_lot(p_lot_id uuid, p_basket_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot   public.lots%rowtype;
  v_sale  public.sales%rowtype;
  v_now   timestamptz := now();
  v_until timestamptz;
BEGIN
  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = v_lot.sale_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;

  -- Self-checkout must be open for this sale (respects the delay window).
  IF v_sale.sale_type <> 'estate_sale'
     OR COALESCE(v_sale.online_checkout_enabled, false) = false
     OR (v_sale.online_checkout_opens_at IS NOT NULL AND v_now < v_sale.online_checkout_opens_at) THEN
    RETURN json_build_object('success', false, 'error', 'checkout_closed');
  END IF;

  IF v_lot.inventory_status = 'sold' THEN
    RETURN json_build_object('success', false, 'error', 'sold');
  END IF;

  -- Held by a different basket and not yet expired?
  IF v_lot.inventory_status = 'held'
     AND v_lot.held_until IS NOT NULL AND v_lot.held_until > v_now
     AND COALESCE(v_lot.held_by, '') <> p_basket_id THEN
    RETURN json_build_object('success', false, 'error', 'held_by_other');
  END IF;

  v_until := v_now + interval '30 minutes';
  UPDATE public.lots
    SET inventory_status = 'held', held_by = p_basket_id, held_until = v_until, updated_at = v_now
    WHERE id = p_lot_id;

  RETURN json_build_object('success', true, 'held_until', v_until);
END;
$$;

-- Release a hold, but only the basket that owns it may release it.
CREATE OR REPLACE FUNCTION public.release_lot(p_lot_id uuid, p_basket_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot public.lots%rowtype;
BEGIN
  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;

  IF v_lot.inventory_status = 'held' AND COALESCE(v_lot.held_by, '') = p_basket_id THEN
    UPDATE public.lots
      SET inventory_status = 'available', held_by = NULL, held_until = NULL, updated_at = now()
      WHERE id = p_lot_id;
    RETURN json_build_object('success', true);
  END IF;

  RETURN json_build_object('success', false, 'error', 'not_held_by_you');
END;
$$;

GRANT EXECUTE ON FUNCTION public.hold_lot(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_lot(uuid, text) TO anon, authenticated;
