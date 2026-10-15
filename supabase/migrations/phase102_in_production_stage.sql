-- Phase 102 — 2. In Production.
--
-- Decided directly (15 Oct 2026): a stage between Concept and Internal
-- Review, in Concept's red, and the numbers move to make room:
--   1 Concept, 2 In Production, 3 Internal Review, 4 Client Review,
--   5 Approved, 6 Live.
-- A post moves to In Production by itself once its Concept (the brief) is
-- written, and on to Internal Review by itself when its first creative or
-- copy is saved, as Concept did before. Neither is picked by hand. Posts
-- already in Concept stay there until content is added (decided directly),
-- even if their Concept is already filled in.
--
-- Every existing post from Internal Review on, and every logged stage
-- change (phase71), moves up one, so history keeps its meaning. Everything
-- that compared a stage number is redefined with the new numbers.

begin;

-- 1. Renumber. The creatives triggers are off meanwhile: this isn't a
--    real stage change (no stage log entry, no live date added or taken
--    away, no Last Activity stamp), and a paused agency's read-only guard
--    mustn't stop it.
--    Once only: a second run (pasted twice) finds the range already 1-6
--    and leaves the numbers alone.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'creatives_stage_range' and conrelid = 'public.creatives'::regclass
      and pg_get_constraintdef(oid) like '%<= 6%'
  ) then
    raise notice 'phase102: already renumbered, skipping';
    return;
  end if;

  alter table creatives drop constraint if exists creatives_stage_range;
  alter table creatives drop constraint if exists creatives_exception_stage;

  alter table creatives disable trigger user;
  update creatives set stage = stage + 1 where stage >= 2;
  alter table creatives enable trigger user;

  update creative_stage_events set from_stage = from_stage + 1 where from_stage >= 2;
  update creative_stage_events set to_stage = to_stage + 1 where to_stage >= 2;

  alter table creatives add constraint creatives_stage_range check (stage between 1 and 6);
  -- Changes requested or rejected: before Approved, as before.
  alter table creatives add constraint creatives_exception_stage
    check (exception is null or stage between 1 and 4);
end;
$$;

-- 2. Concept -> In Production, once the Concept is written: on a new post
--    that has one, or when it's written on a post in Concept.
create or replace function creatives_enter_production()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage = 1 and coalesce(btrim(new.concept), '') <> ''
     and (tg_op = 'INSERT' or new.concept is distinct from old.concept) then
    new.stage := 2;
  end if;
  return new;
end;
$$;
drop trigger if exists creatives_enter_production on creatives;
create trigger creatives_enter_production
  before insert or update of concept on creatives
  for each row execute function creatives_enter_production();

-- 3. Concept or In Production -> Internal Review on the first creative or
--    copy (phase13's, renumbered).
create or replace function bump_creative_from_concept()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  update creatives set stage = 3 where id = new.creative_id and stage in (1, 2);
  return new;
end;
$$;

-- 4. Live by hand (phase100's), renumbered.
create or replace function creatives_live_date()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage = 6 and old.stage is distinct from 6 then
    insert into post_live_dates (creative_id, agency_id, live_at, scheduled_at, source)
    values (new.id, new.agency_id, now(), coalesce(new.scheduled_at, new.due_on::timestamptz), 'manual')
    on conflict (creative_id) do nothing;
  elsif old.stage = 6 and new.stage is distinct from 6 then
    delete from post_live_dates where creative_id = new.id and source = 'manual';
  end if;
  return new;
end;
$$;

-- 5. Found live by the nightly run (phase99's), renumbered.
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
  where c.id = any(p_creative_ids) and c.stage < 5
  on conflict (user_id, creative_id) where kind = 'live_unapproved' do nothing;

  update creatives set stage = 6, exception = null
  where id = any(p_creative_ids) and stage <> 6;
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;
revoke execute on function mark_posts_live(uuid[]) from public, anon, authenticated;

-- 6. The pills (phase99's), renumbered. In Production, like Concept, isn't
--    one of them.
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
    if v_creative.stage = 3 then
      raise exception 'already at Internal Review';
    end if;
    update creatives
    set stage = 3, approved_at = null, approved_by_name = null, approved_by_email = null
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_review' then
    if v_creative.stage = 4 then
      raise exception 'already at Client Review';
    end if;
    update creatives
    set stage = 4, approved_at = null, approved_by_name = null, approved_by_email = null
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_approved' then
    if v_creative.stage = 5 then
      raise exception 'already approved';
    end if;
    -- Back from Live (phase98/99): still approved as it was.
    update creatives
    set stage = 5,
        exception = null,
        approved_at = coalesce(case when v_creative.stage = 6 then v_creative.approved_at end, now()),
        approved_by_name = case when v_creative.stage = 6 and v_creative.approved_at is not null then v_creative.approved_by_name else (select name from users where id = auth.uid()) end,
        approved_by_email = case when v_creative.stage = 6 and v_creative.approved_at is not null then v_creative.approved_by_email else (select email from users where id = auth.uid()) end
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_live' then
    if v_creative.stage = 6 then
      raise exception 'already live';
    end if;
    update creatives
    set stage = 6, exception = null
    where id = p_creative_id
    returning * into v_creative;
  else
    raise exception 'unknown direction: %', p_direction;
  end if;

  return v_creative;
end;
$function$
;

-- 7. A review link's approval (phase99's), renumbered.
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
  set stage = greatest(stage, 5),
      exception = null,
      approved_at = now(),
      approved_by_name = v_name,
      approved_by_email = lower(btrim(p_guest_email))
  where id = p_creative_id
    and (stage < 5 or approved_at is null);
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

-- 8. A client's approval is told (phase99's), renumbered.
create or replace function creatives_notify_client_approval()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage >= 5 and new.approved_at is not null
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

-- 9. The artwork clock (phase99's), renumbered: Approved and Live.
create or replace function run_artwork_housekeeping(p_agency_id uuid default null)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_keys text[] := '{}';
begin
  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    left join client_preferences cp on cp.client_id = p.client_id
    left join post_live_dates l on l.creative_id = c.id
    where c.stage >= 5
      and c.scheduled_at is not null
      and coalesce(l.live_at, c.scheduled_at) < now() - make_interval(days => coalesce(cp.artwork_keep_days, 7))
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    join client_preferences cp on cp.client_id = p.client_id and cp.undated_artwork = 'remove'
    where c.stage >= 5
      and c.scheduled_at is null
      and c.artwork_kept_at is null
      and coalesce(c.due_on::timestamptz, c.approved_at) < now() - make_interval(days => cp.artwork_keep_days)
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  insert into notifications (agency_id, user_id, kind, creative_id)
  select c.agency_id, m.user_id, 'artwork_removal', c.id
  from creatives c
  join projects p on p.id = c.project_id
  left join client_preferences cp on cp.client_id = p.client_id
  join memberships m on m.agency_id = c.agency_id
    and m.client_id is null and m.removed_at is null and m.accepted_at is not null
    and m.role in ('primary_owner', 'owner', 'admin')
  where c.stage >= 5
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

-- 10. What a review link includes (phase69's), renumbered: every post in
--     Client Review (4), plus what the scope picks from Client Review on.
create or replace function shared_link_allowed_creative_ids(v_link shared_links)
returns uuid[]
language sql security definer set search_path = public stable as $$
  select array_agg(id) from creatives
  where project_id = v_link.project_id
    and archived_at is null
    and stage >= 4
    and (
      stage = 4
      or case v_link.scope
        when 'all' then true
        when 'pending' then false
        when 'one' then id = v_link.creative_id
        when 'pick' then id = any(v_link.picked_creatives)
        else false
      end
    );
$$;

-- 11. A review link's changes request (phase77's), renumbered: before
--     Approved.
create or replace function submit_shared_request_changes(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_body text,
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

  if v_link.requires_passcode
     and (p_passcode is null or crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash) then
    return jsonb_build_object('status', 'passcode_required');
  end if;
  if p_guest_name is null or trim(p_guest_name) = '' then
    return jsonb_build_object('status', 'name_required');
  end if;
  v_name := shared_link_contact_name(v_link, p_guest_email);
  if v_name is null then
    return jsonb_build_object('status', 'not_on_client');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  update creatives
  set exception = 'changes_requested'
  where id = p_creative_id and stage between 1 and 4;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id,
    coalesce(nullif(trim(p_body), ''), 'Changes requested via shared review link.'),
    v_name, lower(btrim(p_guest_email)), 'public'
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;

-- 12. A review link's Feed (phase93's), renumbered: another post's name
--     shows while it's with the team (Concept to Internal Review).
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
    'name', case when not (cr.id = any(v_allowed_ids)) and cr.stage <= 3 then cr.name end,
    'stage', cr.stage,
    'reel', 'ig_reel' = any(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end)
  ) order by coalesce(cr.scheduled_at, cr.due_on::timestamptz) desc nulls first, cr.position), '[]'::jsonb)
  into v_feed
  from creatives cr
  where cr.project_id = v_link.project_id and cr.archived_at is null
    and (coalesce(v_others, true) or cr.id = any(v_allowed_ids));

  return jsonb_build_object('status', 'ok', 'feed', v_feed);
end;
$$;
grant execute on function get_shared_review_feed(text, text) to anon, authenticated;

-- 13. The project's activity (phase84's), renumbered: a client's approval
--     names them.
create or replace function project_activity_feed(p_project_id uuid, p_before timestamptz default null, p_limit int default 60)
returns table (at timestamptz, kind text, by_user uuid, by_name text, creative_id uuid, creative_name text, detail jsonb)
language sql stable security invoker set search_path = public, extensions as $$
  with posts as (
    select id, name, created_by, created_at, approved_by_name from creatives where project_id = p_project_id
  ),
  everything as (
    select c.created_at as at, 'post_created'::text as kind, c.created_by as by_user, null::text as by_guest,
           c.id as creative_id, c.name as creative_name, '{}'::jsonb as detail
    from posts c
    union all
    select e.at, 'stage', e.by_user, case when e.to_stage = 5 and e.by_user is null then c.approved_by_name end,
           c.id, c.name, jsonb_build_object('from', e.from_stage, 'to', e.to_stage, 'exception', e.exception)
    from creative_stage_events e join posts c on c.id = e.creative_id
    where e.from_stage is not null
    union all
    select v.created_at, 'artwork_version', v.created_by, null, c.id, c.name, jsonb_build_object('version', v.version_no)
    from creative_versions v join posts c on c.id = v.creative_id
    union all
    select v.created_at, 'copy_version', v.created_by, null, c.id, c.name, jsonb_build_object('version', v.version_no)
    from copy_versions v join posts c on c.id = v.creative_id
    union all
    select m.created_at, 'comment', m.author_id, m.guest_name, c.id, c.name,
           jsonb_build_object('internal', m.visibility = 'private', 'text', left(m.body, 140))
    from comments m join posts c on c.id = m.creative_id
    where m.deleted_at is null
    union all
    select m.resolved_at, 'comment_resolved', m.resolved_by, null, c.id, c.name, jsonb_build_object('text', left(m.body, 140))
    from comments m join posts c on c.id = m.creative_id
    where m.resolved_at is not null and m.deleted_at is null
    union all
    select l.created_at, 'link_shared', l.created_by, null, l.creative_id, (select name from posts where id = l.creative_id), '{}'::jsonb
    from shared_links l where l.project_id = p_project_id
    union all
    select l.revoked_at, 'link_revoked', null, null, l.creative_id, (select name from posts where id = l.creative_id), '{}'::jsonb
    from shared_links l where l.project_id = p_project_id and l.revoked_at is not null
    union all
    select a.at, a.kind, a.by_user, null, a.creative_id, coalesce((select name from posts where id = a.creative_id), a.detail->>'post'), a.detail
    from project_activity a where a.project_id = p_project_id
  )
  select e.at, e.kind, e.by_user, coalesce(u.name, e.by_guest), e.creative_id, e.creative_name, e.detail
  from everything e left join users u on u.id = e.by_user
  where p_before is null or e.at < p_before
  order by e.at desc
  limit least(greatest(p_limit, 1), 200);
$$;

commit;

notify pgrst, 'reload schema';
