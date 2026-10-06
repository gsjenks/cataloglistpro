-- Security Advisor warnings (2026-10-06): SECURITY DEFINER functions callable
-- by anon. Postgres grants EXECUTE to PUBLIC on every new function, so a
-- "GRANT ... TO authenticated" alone never kept anon out. Matched by name so
-- every overload is covered, including the remote-only live-auction functions.
--
-- Deliberately left open to anon (buyer pages, each does its own checks):
--   public_sale, public_sale_lots, public_lot, my_lot, my_basket,
--   renew_my_basket, hold_lot, release_lot

do $$
declare
  r record;
begin
  -- Staff / bidder functions: signed-in users only. All are called through
  -- the authenticated client (lib/supabase), never supabasePublic.
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('advance_lot', 'retract_last_bid', 'reset_auction',
                        'place_bid', 'claim_company_invites', 'delete_company',
                        'delete_sale', 'remove_company_member')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;

  -- Not called by the app at all: get_user_id_by_email is an account-
  -- enumeration oracle, get_company_team_members is unused, and
  -- broadcast_lot_change is a trigger function (firing a trigger does not
  -- need EXECUTE). service_role keeps access.
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_user_id_by_email', 'get_company_team_members',
                        'broadcast_lot_change')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
