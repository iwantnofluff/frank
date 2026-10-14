-- Phase 99 — 5. Live.
--
-- Decided directly (14 Oct 2026): a fifth stage, Live, after Approved, in
-- a darker green. Frank sets it when the nightly run finds a post on its
-- client's Instagram (phase98), and the team can set it by hand for a post
-- Frank can't find (a Story, another platform, a client not connected),
-- which records that moment as its live date. A post found live before it
-- was Approved still moves to Live, and its agency's Owners and Admins are
-- told it went out unapproved. Everything that treated Approved as the end
-- now takes Live too.

alter table creatives drop constraint if exists creatives_stage_range;
alter table creatives add constraint creatives_stage_range check (stage between 1 and 5);

-- A live date set by hand has no Instagram post, and an undated post no
-- scheduled date.
alter table post_live_dates alter column instagram_media_id drop not null;
alter table post_live_dates alter column scheduled_at drop not null;
alter table post_live_dates add column if not exists source text not null default 'instagram'
  check (source in ('instagram', 'manual'));

-- Live by hand: that moment is its live date, unless Frank already found
-- it; leaving Live by hand takes a hand-set date away (Instagram's stays).
create or replace function creatives_live_date()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage = 5 and old.stage is distinct from 5 then
    insert into post_live_dates (creative_id, agency_id, live_at, scheduled_at, source)
    values (new.id, new.agency_id, now(), new.scheduled_at, 'manual')
    on conflict (creative_id) do nothing;
  elsif old.stage = 5 and new.stage is distinct from 5 then
    delete from post_live_dates where creative_id = new.id and source = 'manual';
  end if;
  return new;
end;
$$;
drop trigger if exists creatives_live_date on creatives;
create trigger creatives_live_date
  after update of stage on creatives
  for each row execute function creatives_live_date();

-- Told: a post that went out before it was Approved.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('artwork_removal', 'client_comment', 'client_approval', 'discussion_mention', 'live_unapproved'));
create unique index if not exists notifications_one_live_unapproved
  on notifications (user_id, creative_id) where kind = 'live_unapproved';

-- The nightly run's posts found live (after logging their dates): each
-- moves to Live, and any not yet Approved is told to the agency's Owners
-- and Admins. Service role only. Returns how many moved.
create or replace function mark_posts_live(p_creative_ids uuid[])
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_moved int;
begin
  insert into notifications (agency_id, user_id, kind, creative_id)
  select c.agency_id, m.user_id, 'live_unapproved', c.id
  from creatives c
  join memberships m on m.agency_id = c.agency_id
    and m.client_id is null and m.removed_at is null and m.accepted_at is not null
    and m.role in ('primary_owner', 'owner', 'admin')
  where c.id = any(p_creative_ids) and c.stage < 4
  on conflict (user_id, creative_id) where kind = 'live_unapproved' do nothing;

  update creatives set stage = 5, exception = null
  where id = any(p_creative_ids) and stage <> 5;
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;
revoke execute on function mark_posts_live(uuid[]) from public, anon, authenticated;

-- The pills (phase46's, with Live): to_live, and back to Approved from Live
-- keeping the approval.
CREATE OR REPLACE FUNCTION public.advance_creative_stage(p_creative_id uuid, p_direction text)
 RETURNS creatives
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_creative creatives%rowtype;
begin
  select * into v_creative from creatives where id = p_creative_id;
  if not found then
    raise exception 'creative not found';
  end if;
  if not is_agency_staff(v_creative.agency_id) then
    raise exception 'not permitted';
  end if;
  if not exists (
    select 1 from projects
    where projects.id = v_creative.project_id
      and projects.id in (select staff_visible_project_ids(v_creative.agency_id))
  ) then
    raise exception 'not permitted for this creative''s client';
  end if;

  if p_direction = 'to_internal' then
    if v_creative.stage = 2 then
      raise exception 'already at Internal Review';
    end if;
    update creatives
    set stage = 2, approved_at = null, approved_by_name = null, approved_by_email = null
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_review' then
    if v_creative.stage = 3 then
      raise exception 'already at Client Review';
    end if;
    update creatives
    set stage = 3, approved_at = null, approved_by_name = null, approved_by_email = null
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_approved' then
    if v_creative.stage = 4 then
      raise exception 'already approved';
    end if;
    -- Back from Live (phase98/99): still approved as it was.
    update creatives
    set stage = 4,
        exception = null,
        approved_at = coalesce(case when v_creative.stage = 5 then v_creative.approved_at end, now()),
        approved_by_name = case when v_creative.stage = 5 and v_creative.approved_at is not null then v_creative.approved_by_name else (select name from users where id = auth.uid()) end,
        approved_by_email = case when v_creative.stage = 5 and v_creative.approved_at is not null then v_creative.approved_by_email else (select email from users where id = auth.uid()) end
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_live' then
    -- Live (phase99, decided directly): set by hand for a post Frank can't
    -- find on Instagram; its approval stays as it was.
    if v_creative.stage = 5 then
      raise exception 'already live';
    end if;
    update creatives
    set stage = 5, exception = null
    where id = p_creative_id
    returning * into v_creative;
  else
    raise exception 'unknown direction: %', p_direction;
  end if;

  return v_creative;
end;
$function$
;

-- A review link's approval leaves a Live post Live (phase77's, else as was).
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
  v_name text;
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
  -- Only the client's own people (phase77).
  v_name := shared_link_contact_name(v_link, p_guest_email);
  if v_name is null then
    return jsonb_build_object('status', 'not_on_client');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  -- A post already Live stays Live (phase99).
  update creatives
  set stage = greatest(stage, 4),
      exception = null,
      approved_at = now(),
      approved_by_name = v_name,
      approved_by_email = lower(btrim(p_guest_email))
  where id = p_creative_id
    and (stage < 4 or approved_at is null);
  if not found then
    return jsonb_build_object('status', 'ok', 'already_approved', true);
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Approved via shared review link.',
    v_name, lower(btrim(p_guest_email)), 'public'
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;

-- A client's approval is told whether the post is Approved or Live.
create or replace function creatives_notify_client_approval()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage >= 4 and new.approved_at is not null
     and new.approved_at is distinct from old.approved_at
     and new.approved_by_email is not null
     and exists (
       select 1 from projects p join client_contacts cc on cc.client_id = p.client_id
       where p.id = new.project_id and cc.archived_at is null
         and lower(cc.email) = lower(new.approved_by_email)
     ) then
    perform notify_client_activity(new.id, 'client_approval', null);
  end if;
  return new;
end;
$$;

-- The artwork clock (phase98's): Live posts too.
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
    where c.stage >= 4
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
    where c.stage >= 4
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
  where c.stage >= 4
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

