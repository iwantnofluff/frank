-- Phase 61 — the daily artwork run, for one agency at a time if asked.
--
-- phase60's run_artwork_housekeeping() sweeps every agency, which is what
-- the daily cron wants. The test suite needs to run it for its own test
-- agency only, never touching anyone else's artwork, so it now takes an
-- optional agency; the cron still passes none.

drop function run_artwork_housekeeping();

-- The daily run (the service role only, from the cron route): removes
-- what's due, notifies about what's waiting on a decision, and returns
-- the storage paths to delete.
create or replace function run_artwork_housekeeping(p_agency_id uuid default null)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_keys text[] := '{}';
begin
  -- Approved, live more than 7 days ago, artwork still there.
  for r in
    select c.id from creatives c
    where c.stage = 4
      and c.scheduled_at is not null
      and c.scheduled_at < now() - interval '7 days'
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  -- Approved with no live date, 7 days past the due date (or the approval),
  -- not kept: each Owner and Admin of the agency is told, once.
  insert into notifications (agency_id, user_id, kind, creative_id)
  select c.agency_id, m.user_id, 'artwork_removal', c.id
  from creatives c
  join memberships m on m.agency_id = c.agency_id
    and m.client_id is null and m.removed_at is null and m.accepted_at is not null
    and m.role in ('primary_owner', 'owner', 'admin')
  where c.stage = 4
    and c.scheduled_at is null
    and c.artwork_kept_at is null
    and coalesce(c.due_on::timestamptz, c.approved_at) < now() - interval '7 days'
    and creative_has_artwork(c.id)
    and (p_agency_id is null or c.agency_id = p_agency_id)
  on conflict (user_id, kind, creative_id) do nothing;

  return v_keys;
end;
$$;
revoke execute on function run_artwork_housekeeping(uuid) from public, anon, authenticated;
