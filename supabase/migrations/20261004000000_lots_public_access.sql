
-- Lots: close anonymous reads; public pages go through allow-
listed functions.
--
-- Found 2026-10-04: with the public anon key, `GET /rest/v1/lots` returned every
-- column of every lot — buyer, sold_price, reserve_price, consignor, held_by,
-- delivery_*, tracking. held_by is the shopper id, which was also the
-- shopper credential (hold_lot/release_lot took it as the basket key), so reading
-- it was enough to act as that shopper.
--
-- This migration:
--   1. Replaces every policy on public.lots with company-member policies (the
--      lots policies previously existed only in the hosted DB; from here on
--      they are version-controlled) and revokes table privileges from anon.
--   2. Adds SECURITY DEFINER read functions that return public columns only:
--      public_sale(), public_sale_lots(), public_lot().
--   3. Adds shopper tokens: a random secret issued by the shopper-verify edge
--      function at verification, stored here only as a SHA-256 hash.
--      my_lot(), my_basket(), renew_my_basket() and the new hold_lot() /
--      release_lot() all take the token, never the bare shopper id.
--   4. Broadcasts a content-free "lot_changed" realtime message per sale, since
--      anon no longer receives postgres_changes on lots.
--
-- lots.held_by stays the shopper id, so staff screens (baskets, register) are
-- unchanged. Existing shoppers hold no token and must re-verify once.
--
-- Apply BY HAND (SQL editor). Before applying, snapshot the current policies:
--   select policyname, roles, cmd, qual, with_check from pg_policies for the
--   public.lots table, and keep the output.
-- The DO block below also prints each dropped policy as a NOTICE.
-- Idempotent (safe to re-run).

-- == 1. lots RLS =============================================================

ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname, roles, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'lots'
  LOOP
    RAISE NOTICE 'dropping lots policy % (roles=% cmd=% using=% check=%)',
      p.policyname, p.roles, p.cmd, p.qual, p.with_check;
    EXECUTE format('DROP POLICY %I ON public.lots', p.policyname);
  END LOOP;
END $$;

-- A lot belongs to a sale; access follows the company of the sale (member or owner),
-- the same rule delete_sale() uses.
CREATE POLICY lots_company_members ON public.lots
  FOR ALL TO authenticated
  USING (
    sale_id IN (
      SELECT s.id FROM public.sales s
       WHERE s.company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
          OR s.company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    sale_id IN (
      SELECT s.id FROM public.sales s
       WHERE s.company_id IN (SELECT company_id FROM public.user_companies WHERE user_id = auth.uid())
          OR s.company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
    )
  );

-- Belt and braces: even a stray future policy cannot open lots to anon.
REVOKE ALL ON public.lots FROM anon;

-- == 2. Public read functions ===============================================
-- Allow-listed columns only. Never add buyer, sold_price, reserve_price,
-- consignor*, held_by, delivery_*, payment/refund or tracking fields here.

CREATE OR REPLACE FUNCTION public.public_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'subtitle', s.subtitle,
    'sale_type', s.sale_type,
    'online_checkout_enabled', s.online_checkout_enabled,
    'online_checkout_opens_at', s.online_checkout_opens_at
  )
  FROM public.sales s
  WHERE s.id = p_sale_id;
$$;

-- Public fields of one lot. held_until is exposed (not who holds it) so pages
-- can treat an expired hold as available.
CREATE OR REPLACE FUNCTION public._public_lot_json(l public.lots)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', l.id,
    'sale_id', l.sale_id,
    'lot_number', l.lot_number,
    'name', l.name,
    'description', l.description,
    'condition', l.condition,
    'category', l.category,
    'origin', l.origin,
    'creator', l.creator,
    'materials', l.materials,
    'style', l.style,
    'height', l.height,
    'width', l.width,
    'depth', l.depth,
    'dimension_unit', l.dimension_unit,
    'starting_bid', l.starting_bid,
    'opening_bid', l.opening_bid,
    'estimate_low', l.estimate_low,
    'estimate_high', l.estimate_high,
    'inventory_status', l.inventory_status,
    'held_until', CASE WHEN l.inventory_status = 'held' THEN l.held_until END
  );
$$;

CREATE OR REPLACE FUNCTION public.public_lot(p_lot_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public._public_lot_json(l) FROM public.lots l WHERE l.id = p_lot_id;
$$;

-- Every lot in a sale, with its primary photo path, ordered by lot number.
CREATE OR REPLACE FUNCTION public.public_sale_lots(p_sale_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      public._public_lot_json(l) || jsonb_build_object(
        'primary_file_path',
        (SELECT p.file_path FROM public.photos p
          WHERE p.lot_id = l.id
          ORDER BY p.is_primary DESC NULLS LAST, p.sort_order NULLS LAST, p.created_at
          LIMIT 1)
      )
      ORDER BY l.lot_number NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM public.lots l
  WHERE l.sale_id = p_sale_id;
$$;

-- == 3. Shopper tokens ======================================================

CREATE TABLE IF NOT EXISTS public.shopper_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopper_id   uuid NOT NULL REFERENCES public.shoppers(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,  -- hex SHA-256 of the token; the token itself is never stored
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_shopper_tokens_shopper ON public.shopper_tokens (shopper_id);

-- No policies: only the service role (shopper-verify) and the SECURITY DEFINER
-- functions below can touch it.
ALTER TABLE public.shopper_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shopper_tokens FROM anon, authenticated;

-- Token -> shopper id, or NULL. Internal; not callable by clients.
CREATE OR REPLACE FUNCTION public._shopper_from_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;
  UPDATE public.shopper_tokens
     SET last_used_at = now()
   WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  RETURNING shopper_id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._shopper_from_token(text) FROM PUBLIC, anon, authenticated;

-- Live holds of the token in a sale (the basket), plus who it belongs to.
CREATE OR REPLACE FUNCTION public.my_basket(p_sale_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shopper uuid := public._shopper_from_token(p_token);
  v_name    text;
  v_items   jsonb;
BEGIN
  IF v_shopper IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  SELECT name INTO v_name FROM public.shoppers WHERE id = v_shopper;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', l.id,
           'lot_number', l.lot_number,
           'name', l.name,
           'starting_bid', l.starting_bid,
           'held_until', l.held_until
         ) ORDER BY l.lot_number NULLS LAST), '[]'::jsonb)
    INTO v_items
    FROM public.lots l
   WHERE l.sale_id = p_sale_id
     AND l.held_by = v_shopper::text
     AND l.inventory_status = 'held'
     AND l.held_until > now();
  RETURN jsonb_build_object(
    'success', true,
    'shopper_id', v_shopper,
    'name', v_name,
    'items', v_items
  );
END;
$$;

-- How the token relates to one lot: its hold, or its purchase with the
-- delivery details. NULL when the token holds/bought nothing here (including
-- an invalid token), so a caller learns nothing about other shoppers.
CREATE OR REPLACE FUNCTION public.my_lot(p_lot_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shopper uuid := public._shopper_from_token(p_token);
  v_lot     public.lots%rowtype;
  v_sh      public.shoppers%rowtype;
  r         record;
  v_deliver boolean;
BEGIN
  IF v_shopper IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_lot.inventory_status = 'held' AND v_lot.held_by = v_shopper::text
     AND (v_lot.held_until IS NULL OR v_lot.held_until > now()) THEN
    RETURN jsonb_build_object('relation', 'holder', 'held_until', v_lot.held_until);
  END IF;

  IF v_lot.inventory_status = 'sold' THEN
    SELECT ti.price, ti.fulfillment, t.created_at,
           t.delivery_address, t.delivery_date, t.delivery_estimate,
           t.delivery_company, t.delivery_company_phone, t.delivery_company_email
      INTO r
      FROM public.sales_transaction_items ti
      JOIN public.sales_transactions t ON t.id = ti.transaction_id
     WHERE ti.lot_id = p_lot_id
       AND t.shopper_id = v_shopper
       AND t.status = 'completed'
     ORDER BY t.created_at DESC
     LIMIT 1;
    IF FOUND THEN
      v_deliver := r.fulfillment = 'delivery' OR COALESCE(v_lot.for_delivery, false);
      SELECT * INTO v_sh FROM public.shoppers WHERE id = v_shopper;
      -- Delivery resolves transaction, then shopper profile, then the columns on
      -- the lot itself: the same order EstateFulfillmentPanel uses.
      RETURN jsonb_build_object(
        'relation', 'buyer',
        'price', r.price,
        'purchased_at', r.created_at,
        'fulfillment', CASE WHEN v_deliver THEN 'delivery' ELSE 'carry' END,
        'delivery', CASE WHEN v_deliver THEN jsonb_build_object(
          'address', COALESCE(NULLIF(r.delivery_address, ''), NULLIF(v_sh.delivery_address, ''), NULLIF(v_lot.delivery_address, '')),
          'date', COALESCE(NULLIF(r.delivery_date, ''), NULLIF(v_sh.delivery_date, ''), NULLIF(v_lot.delivery_date, '')),
          'estimate', COALESCE(NULLIF(r.delivery_estimate, ''), NULLIF(v_sh.delivery_estimate, ''), NULLIF(v_lot.delivery_estimate, '')),
          'company', COALESCE(NULLIF(r.delivery_company, ''), NULLIF(v_sh.delivery_company, ''), NULLIF(v_lot.delivery_company, '')),
          'company_phone', COALESCE(NULLIF(r.delivery_company_phone, ''), NULLIF(v_sh.delivery_company_phone, ''), NULLIF(v_lot.delivery_company_phone, '')),
          'company_email', COALESCE(NULLIF(r.delivery_company_email, ''), NULLIF(v_sh.delivery_company_email, ''), NULLIF(v_lot.delivery_company_email, ''))
        ) END
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Reset every live hold in the basket of the token for a sale to a fresh 30 minutes
-- (any shopper activity means they are still shopping). Expired holds are not
-- resurrected.
CREATE OR REPLACE FUNCTION public.renew_my_basket(p_sale_id uuid, p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shopper uuid := public._shopper_from_token(p_token);
  v_until   timestamptz := now() + interval '30 minutes';
  v_count   int;
BEGIN
  IF v_shopper IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_token');
  END IF;
  UPDATE public.lots
     SET held_until = v_until, updated_at = now()
   WHERE sale_id = p_sale_id
     AND held_by = v_shopper::text
     AND inventory_status = 'held'
     AND held_until > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('success', true, 'renewed', v_count, 'held_until', v_until);
END;
$$;

-- hold_lot / release_lot now take the token. The old (p_lot_id, p_basket_id)
-- versions have the same argument types, so they must be dropped, not replaced;
-- an old cached build calling them by the old parameter name gets an error.
DROP FUNCTION IF EXISTS public.hold_lot(uuid, text);
DROP FUNCTION IF EXISTS public.release_lot(uuid, text);

-- Place (or refresh) a 30-minute hold for the shopper of the token on an available
-- item, and reset the rest of the basket of that shopper in the sale to the same
-- timer (adding an item proves they are still shopping).
CREATE FUNCTION public.hold_lot(p_lot_id uuid, p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shopper uuid := public._shopper_from_token(p_token);
  v_lot     public.lots%rowtype;
  v_sale    public.sales%rowtype;
  v_now     timestamptz := now();
  v_until   timestamptz;
BEGIN
  IF v_shopper IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_token');
  END IF;

  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id FOR UPDATE;
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

  -- Held by someone else: a live timed hold, or an indefinite staff hold.
  IF v_lot.inventory_status = 'held'
     AND COALESCE(v_lot.held_by, '') <> v_shopper::text
     AND (v_lot.held_until IS NULL OR v_lot.held_until > v_now) THEN
    RETURN json_build_object('success', false, 'error', 'held_by_other');
  END IF;

  v_until := v_now + interval '30 minutes';
  UPDATE public.lots
     SET inventory_status = 'held', held_by = v_shopper::text, held_until = v_until, updated_at = v_now
   WHERE id = p_lot_id;

  UPDATE public.lots
     SET held_until = v_until, updated_at = v_now
   WHERE sale_id = v_lot.sale_id
     AND id <> p_lot_id
     AND held_by = v_shopper::text
     AND inventory_status = 'held'
     AND held_until > v_now;

  RETURN json_build_object('success', true, 'held_until', v_until);
END;
$$;

-- Release a hold; only the shopper of the token may release it.
CREATE FUNCTION public.release_lot(p_lot_id uuid, p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shopper uuid := public._shopper_from_token(p_token);
  v_lot     public.lots%rowtype;
BEGIN
  IF v_shopper IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'invalid_token');
  END IF;

  SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;

  IF v_lot.inventory_status = 'held' AND COALESCE(v_lot.held_by, '') = v_shopper::text THEN
    UPDATE public.lots
       SET inventory_status = 'available', held_by = NULL, held_until = NULL, updated_at = now()
     WHERE id = p_lot_id;
    RETURN json_build_object('success', true);
  END IF;

  RETURN json_build_object('success', false, 'error', 'not_held_by_you');
END;
$$;

REVOKE ALL ON FUNCTION public._public_lot_json(public.lots) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_sale(uuid)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_lot(uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_sale_lots(uuid)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_basket(uuid, text)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_lot(uuid, text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_my_basket(uuid, text)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_lot(uuid, text)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_lot(uuid, text)        TO anon, authenticated;

-- == 4. Realtime for public pages ===========================================
-- anon no longer passes RLS on lots, so postgres_changes delivers it nothing.
-- Instead each change that public pages care about sends a public broadcast on
-- topic sale-lots:<sale_id> carrying only the lot id; pages re-fetch through
-- the functions above. Staff postgres_changes subscriptions are unaffected.

CREATE OR REPLACE FUNCTION public.broadcast_lot_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale uuid;
  v_lot  uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_sale := OLD.sale_id; v_lot := OLD.id;
  ELSE
    v_sale := NEW.sale_id; v_lot := NEW.id;
    IF TG_OP = 'UPDATE'
       AND (NEW.sale_id, NEW.inventory_status, NEW.held_until, NEW.held_by, NEW.lot_number,
            NEW.name, NEW.description, NEW.starting_bid, NEW.estimate_low, NEW.estimate_high)
           IS NOT DISTINCT FROM
           (OLD.sale_id, OLD.inventory_status, OLD.held_until, OLD.held_by, OLD.lot_number,
            OLD.name, OLD.description, OLD.starting_bid, OLD.estimate_low, OLD.estimate_high) THEN
      RETURN NULL;
    END IF;
  END IF;
  IF v_sale IS NULL THEN RETURN NULL; END IF;

  -- Best effort: a realtime hiccup must never block a lot write.
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('lot_id', v_lot, 'op', TG_OP),
      'lot_changed',
      'sale-lots:' || v_sale::text,
      false
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_lot_change: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS lots_broadcast_change ON public.lots;
CREATE TRIGGER lots_broadcast_change
  AFTER INSERT OR UPDATE OR DELETE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_lot_change();
