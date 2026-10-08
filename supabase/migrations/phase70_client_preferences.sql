-- Phase 70 — a client's Preferences.
--
-- Decided directly (8 Oct 2026): Client Settings gets a Preferences tab,
-- changed by Owners and Admins (the same people as Details and People), with:
-- - how long an Approved post's artwork is kept after its live date: 7, 14,
--   21 or 28 days (was 7 for everyone, phase60/61);
-- - for Approved posts with no live date: ask Owners and Admins in the bell
--   (as now), or remove after the same number of days;
-- - whether a review link's feed shows the project's other posts (phase67/68),
--   or only the posts in review;
-- - whether the client can approve on review links at all (in the app only
--   the agency approves; clients approve through links);
-- - what a new review link starts with: approve on or off, when it expires,
--   passcode on or off.
--
-- No row means today's defaults, so nothing changes until a preference is
-- saved; every reader below coalesces to them.

create table client_preferences (
  client_id uuid primary key references clients (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  artwork_keep_days int not null default 7 check (artwork_keep_days in (7, 14, 21, 28)),
  undated_artwork text not null default 'ask' check (undated_artwork in ('ask', 'remove')),
  feed_shows_other_posts boolean not null default true,
  client_can_approve boolean not null default true,
  link_can_approve boolean not null default true,
  -- 0 = never.
  link_expires_days int not null default 14 check (link_expires_days in (0, 7, 14, 30)),
  link_passcode boolean not null default false,
  updated_at timestamptz not null default now()
);

-- agency_id from the client, never from what's sent (as every child row).
create trigger client_preferences_agency
  before insert or update on client_preferences
  for each row execute function set_agency_id_from_client();

alter table client_preferences enable row level security;

-- Read by the agency's staff and by the client's own people.
create policy client_preferences_select on client_preferences
  for select using (is_agency_staff(agency_id) or client_id in (select current_client_ids(agency_id)));
-- Changed by Owners and Admins (is_agency_admin covers both, and the
-- Primary Owner).
create policy client_preferences_insert on client_preferences
  for insert with check (is_agency_admin(agency_id));
create policy client_preferences_update on client_preferences
  for update using (is_agency_admin(agency_id)) with check (is_agency_admin(agency_id));

-- The daily run, per client's preferences (otherwise as phase61).
create or replace function run_artwork_housekeeping(p_agency_id uuid default null)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_keys text[] := '{}';
begin
  -- Approved, live longer ago than the client keeps artwork, still there.
  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    left join client_preferences cp on cp.client_id = p.client_id
    where c.stage = 4
      and c.scheduled_at is not null
      and c.scheduled_at < now() - make_interval(days => coalesce(cp.artwork_keep_days, 7))
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
  on conflict (user_id, kind, creative_id) do nothing;

  return v_keys;
end;
$$;
revoke execute on function run_artwork_housekeeping(uuid) from public, anon, authenticated;

-- A review link's feed (phase68), with only the link's own posts when the
-- client's feed doesn't show the others.
create or replace function get_shared_review_feed(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_others boolean;
  v_feed jsonb;
begin
  select * into v_link from shared_links where token = p_token and revoked_at is null;

  if not found or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_link.requires_passcode then
    if p_passcode is null or p_passcode = '' then
      return jsonb_build_object('status', 'passcode_required');
    end if;
    if crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash then
      return jsonb_build_object('status', 'passcode_required', 'invalid', true);
    end if;
  end if;

  v_allowed_ids := coalesce(shared_link_allowed_creative_ids(v_link), '{}');
  select coalesce(cp.feed_shows_other_posts, true) into v_others
    from projects p left join client_preferences cp on cp.client_id = p.client_id
    where p.id = v_link.project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', case when cr.id = any(v_allowed_ids) then cr.id end,
    'name', case when not (cr.id = any(v_allowed_ids)) and cr.stage <= 2 then cr.name end,
    'stage', cr.stage,
    'reel', 'ig_reel' = any(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end)
  ) order by cr.position), '[]'::jsonb)
  into v_feed
  from creatives cr
  where cr.project_id = v_link.project_id and cr.archived_at is null
    and (coalesce(v_others, true) or cr.id = any(v_allowed_ids));

  return jsonb_build_object('status', 'ok', 'feed', v_feed);
end;
$$;

grant execute on function get_shared_review_feed(text, text) to anon, authenticated;

-- Approving through a review link (phase53), refused when the client can't
-- approve. Otherwise exactly phase53.
create or replace function submit_shared_approval(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_guest_name text,
  p_guest_email text
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_comment_id uuid;
begin
  select * into v_link from shared_links
  where token = p_token and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not v_link.can_approve then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if exists (
    select 1 from projects p join client_preferences cp on cp.client_id = p.client_id
    where p.id = v_link.project_id and not cp.client_can_approve
  ) then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if v_link.requires_passcode
     and (p_passcode is null or crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash) then
    return jsonb_build_object('status', 'passcode_required');
  end if;
  if p_guest_name is null or trim(p_guest_name) = '' then
    return jsonb_build_object('status', 'name_required');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  update creatives
  set stage = 4,
      exception = null,
      approved_at = now(),
      approved_by_name = trim(p_guest_name),
      approved_by_email = nullif(trim(p_guest_email), '')
  where id = p_creative_id
    and (stage is distinct from 4 or approved_at is null);
  if not found then
    return jsonb_build_object('status', 'ok', 'already_approved', true);
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Approved via shared review link.',
    trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public'
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;
