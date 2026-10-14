-- Phase 98 — when a post really went live.
--
-- Decided directly (14 Oct 2026): a scheduled post is found on its
-- client's connected Instagram by its caption, and the moment it went live
-- is logged, with the date it was scheduled for then, so a late post's
-- delay can be counted in Analytics. Strict matches only (no one confirms
-- them), checked nightly; nothing on the post itself changes.
--
-- Its own table, not creatives.published_at: a change to a post stamps
-- its updated_at (phase82), which someone with it open would then be
-- asked about; the nightly run shouldn't do that. Written by the nightly
-- run alone (service role); the team reads it.

create table if not exists post_live_dates (
  creative_id uuid primary key references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  -- The Instagram post it was found as; each is one post's at most.
  instagram_media_id text not null unique,
  permalink text,
  -- When Instagram says it was published.
  live_at timestamptz not null,
  -- The post's live date when it was found, so the delay holds if the
  -- date is changed afterwards.
  scheduled_at timestamptz not null,
  matched_at timestamptz not null default now()
);

drop trigger if exists post_live_dates_set_agency_id on post_live_dates;
create trigger post_live_dates_set_agency_id
  before insert on post_live_dates
  for each row execute function set_agency_id_from_creative();

alter table post_live_dates enable row level security;

drop policy if exists post_live_dates_select on post_live_dates;
create policy post_live_dates_select on post_live_dates
  for select using (agency_id in (select current_agency_ids()) and is_agency_staff(agency_id));

-- The artwork clock (decided directly): from when it really went live.
create or replace function run_artwork_housekeeping(p_agency_id uuid default null)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_keys text[] := '{}';
begin
  -- Approved, live longer ago than the client keeps artwork, still there.
  -- Live from when it really went live where that's logged (phase98),
  -- else from its live date.
  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    left join client_preferences cp on cp.client_id = p.client_id
    left join post_live_dates l on l.creative_id = c.id
    where c.stage = 4
      and c.scheduled_at is not null
      and coalesce(l.live_at, c.scheduled_at) < now() - make_interval(days => coalesce(cp.artwork_keep_days, 7))
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  -- Approved with no live date, as long past the due date (or the
  -- approval), not kept, at a client that chose to remove them: removed.
  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    join client_preferences cp on cp.client_id = p.client_id and cp.undated_artwork = 'remove'
    where c.stage = 4
      and c.scheduled_at is null
      and c.artwork_kept_at is null
      and coalesce(c.due_on::timestamptz, c.approved_at) < now() - make_interval(days => cp.artwork_keep_days)
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  -- The same, at a client that asks (the default): each Owner and Admin of
  -- the agency is told, once.
  insert into notifications (agency_id, user_id, kind, creative_id)
  select c.agency_id, m.user_id, 'artwork_removal', c.id
  from creatives c
  join projects p on p.id = c.project_id
  left join client_preferences cp on cp.client_id = p.client_id
  join memberships m on m.agency_id = c.agency_id
    and m.client_id is null and m.removed_at is null and m.accepted_at is not null
    and m.role in ('primary_owner', 'owner', 'admin')
  where c.stage = 4
    and c.scheduled_at is null
    and c.artwork_kept_at is null
    and coalesce(cp.undated_artwork, 'ask') = 'ask'
    and coalesce(c.due_on::timestamptz, c.approved_at) < now() - make_interval(days => coalesce(cp.artwork_keep_days, 7))
    and creative_has_artwork(c.id)
    and (p_agency_id is null or c.agency_id = p_agency_id)
  on conflict (user_id, kind, creative_id) where kind = 'artwork_removal' do nothing;

  return v_keys;
end;
$$;
revoke execute on function run_artwork_housekeeping(uuid) from public, anon, authenticated;
