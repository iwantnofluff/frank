-- phase13_simplify_stage_pipeline.sql
--
-- Collapses the 8-stage pipeline (Concept, Copy, Design, Internal QC,
-- Client review, Approved, Scheduled, Published) down to 4: Concept,
-- Internal Review, Client Review, Approved. Stages 2/3 (Copy/Design) and
-- 7/8 (Scheduled/Published) were never reachable by any code path in the
-- app — confirmed by a repo-wide search before writing this — so this
-- isn't a behaviour change so much as removing rooms nobody ever entered.
--
-- Also: Concept -> Internal Review becomes automatic (a trigger, not an
-- app-code call that could be forgotten), and a staff-side Approve/revoke
-- path is added alongside the existing guest-approval one.
--
-- Real production data checked before writing this migration: 12
-- creatives, one of them ("This is a Test Post") sitting at stage 1 with
-- a creative_version and two copy_versions already saved — the exact bug
-- report this migration fixes. The data remap below is content-aware for
-- that reason.

-- 1. Remap existing data first, while the old (wider) constraints still
--    hold, so nothing here can violate a bound mid-migration.
update creatives
set
  stage = case
    when stage between 2 and 4 then 2
    when stage = 5 then 3
    when stage >= 6 then 4
    when stage = 1 and (
      exists (select 1 from creative_versions cv where cv.creative_id = creatives.id)
      or exists (select 1 from copy_versions cpv where cpv.creative_id = creatives.id)
    ) then 2
    else 1
  end,
  exception = case when stage >= 6 then null else exception end;

-- 2. Narrow the constraints to the new 4-stage range.
alter table creatives drop constraint creatives_stage_range;
alter table creatives drop constraint creatives_exception_stage;
alter table creatives
  add constraint creatives_stage_range check (stage between 1 and 4),
  add constraint creatives_exception_stage check (exception is null or stage between 1 and 3);

-- 3. advance_creative_stage — was internal-band(<5)<->5<->4 only. Now a
--    third direction (to_approved, staff-side, mirrors
--    submit_shared_approval's attribution shape) and permissive legal
--    moves (any direction from any stage) — SECURITY DEFINER here was
--    never the authorization boundary (creatives_update already lets
--    staff write stage directly), just where the bookkeeping lives.
create or replace function advance_creative_stage(p_creative_id uuid, p_direction text)
returns creatives
language plpgsql security definer set search_path = public as $$
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
    update creatives
    set stage = 4,
        exception = null,
        approved_at = now(),
        approved_by_name = (select name from users where id = auth.uid()),
        approved_by_email = (select email from users where id = auth.uid())
    where id = p_creative_id
    returning * into v_creative;
  else
    raise exception 'unknown direction: %', p_direction;
  end if;

  return v_creative;
end;
$$;

-- 4. shared_link_allowed_creative_ids — the internal band was stage < 5,
--    now stage < 3 (just Concept/Internal Review).
create or replace function shared_link_allowed_creative_ids(v_link shared_links)
returns uuid[]
language sql security definer set search_path = public stable as $$
  select array_agg(id) from creatives
  where project_id = v_link.project_id
    and archived_at is null
    and stage >= 3
    and (
      case v_link.scope
        when 'all' then true
        when 'pending' then stage = 3
        when 'one' then id = v_link.creative_id
        when 'pick' then id = any(v_link.picked_creatives)
        else false
      end
    );
$$;

-- 5. submit_shared_approval — Approved is now stage 4, not 6. Also now
--    clears `exception` explicitly (it didn't before — harmless today
--    since nothing sets `exception` anywhere in the app, but the new,
--    narrower creatives_exception_stage constraint would otherwise reject
--    an approval on a creative that ever did have one set).
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
  where id = p_creative_id;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Approved via shared review link.',
    trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public'
  );

  return jsonb_build_object('status', 'ok');
end;
$$;

-- 6. New: Concept -> Internal Review, automatic on first content.
create or replace function bump_creative_from_concept()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update creatives set stage = 2 where id = new.creative_id and stage = 1;
  return new;
end;
$$;

drop trigger if exists creative_versions_bump_stage on creative_versions;
create trigger creative_versions_bump_stage
  after insert on creative_versions
  for each row execute function bump_creative_from_concept();

drop trigger if exists copy_versions_bump_stage on copy_versions;
create trigger copy_versions_bump_stage
  after insert on copy_versions
  for each row execute function bump_creative_from_concept();
