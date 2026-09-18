-- Phase 6 — Shared Zero-Account Client Review
-- Run this once against the live database. seed.sql has been updated to
-- include all of this for future fresh installs, but seed.sql itself has
-- already been run once and can't be re-run (tables already exist) — this
-- file is the incremental migration for the database as it stands today.

-- 1. comments: guest authorship ----------------------------------------------
-- A shared-link visitor has no users row at all — attributed by name/email
-- instead of author_id.

alter table comments alter column author_id drop not null;
alter table comments add column guest_name text;
alter table comments add column guest_email text;
alter table comments add constraint comments_author_shape
  check (author_id is not null or guest_name is not null);

-- 2. creatives: approval attribution ------------------------------------------
-- Set by an approval coming through a shared review link. No status_events
-- table yet (deferred in Phase 1), so this is the record until that exists.

alter table creatives add column approved_at timestamptz;
alter table creatives add column approved_by_name text;
alter table creatives add column approved_by_email text;

-- 3. shared_links --------------------------------------------------------------

create type shared_link_scope as enum ('pending', 'all', 'one', 'pick');

create table shared_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  project_id uuid not null references projects (id),
  token text not null unique,
  scope shared_link_scope not null,
  creative_id uuid references creatives (id), -- used when scope = 'one'
  picked_creatives uuid[], -- used when scope = 'pick'
  expires_at timestamptz,
  requires_passcode boolean not null default false,
  passcode_hash text, -- bf-crypted; never selectable by anon (column grant below)
  can_approve boolean not null default false,
  created_by uuid not null references users (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shared_links_passcode_shape check (
    (requires_passcode and passcode_hash is not null)
    or (not requires_passcode and passcode_hash is null)
  )
);

create index shared_links_token_idx on shared_links (token);

create trigger shared_links_set_agency_id
  before insert or update of project_id on shared_links
  for each row execute function set_agency_id_from_project();

-- 4. RLS -----------------------------------------------------------------------
-- Agency staff manage links normally. The public flow doesn't use RLS at
-- all — the functions in section 5 are SECURITY DEFINER and look the row
-- up themselves, so anon never needs a broad grant on shared_links,
-- creatives, comments, projects etc. The narrow anon policy below is a
-- belt-and-braces convenience satisfying "anon can query by token", with
-- passcode_hash, agency_id and created_by withheld at the column level
-- regardless of what any policy allows.

alter table shared_links enable row level security;

create policy shared_links_select on shared_links
  for select using (is_agency_staff(agency_id));
create policy shared_links_insert on shared_links
  for insert with check (is_agency_staff(agency_id));
create policy shared_links_update on shared_links
  for update using (is_agency_staff(agency_id));

create policy shared_links_public_select on shared_links
  for select to anon
  using (revoked_at is null and (expires_at is null or expires_at > now()));

grant select (
  id, project_id, token, scope, creative_id, picked_creatives,
  expires_at, requires_passcode, can_approve, created_at
) on shared_links to anon;

-- 5. Shared review — public functions ------------------------------------------

create or replace function create_shared_link(
  p_project_id uuid,
  p_scope shared_link_scope,
  p_creative_id uuid default null,
  p_picked_creatives uuid[] default null,
  p_expires_in_days int default null, -- null or 0 = never
  p_passcode text default null,
  p_can_approve boolean default false
)
returns table (token text)
language plpgsql as $$
declare
  v_token text := encode(gen_random_bytes(16), 'hex');
begin
  insert into shared_links (
    project_id, token, scope, creative_id, picked_creatives,
    expires_at, requires_passcode, passcode_hash, can_approve, created_by
  ) values (
    p_project_id, v_token, p_scope, p_creative_id, p_picked_creatives,
    case when p_expires_in_days is null or p_expires_in_days = 0 then null
         else now() + (p_expires_in_days || ' days')::interval end,
    p_passcode is not null and p_passcode <> '',
    case when p_passcode is not null and p_passcode <> ''
         then crypt(p_passcode, gen_salt('bf')) else null end,
    p_can_approve,
    auth.uid()
  );
  return query select v_token;
end;
$$;

grant execute on function create_shared_link(uuid, shared_link_scope, uuid, uuid[], int, text, boolean)
  to authenticated;

-- Resolves which creatives a link's scope covers. Stage < 5 (the internal
-- band: Concept, Copy, Design, Internal QC) is excluded unconditionally —
-- an unreleased draft never leaves the building through this door,
-- whatever scope was picked or however a creative_id ended up on the link.
create or replace function shared_link_allowed_creative_ids(v_link shared_links)
returns uuid[]
language sql security definer set search_path = public stable as $$
  select array_agg(id) from creatives
  where project_id = v_link.project_id
    and archived_at is null
    and stage >= 5
    and (
      case v_link.scope
        when 'all' then true
        when 'pending' then stage = 5
        when 'one' then id = v_link.creative_id
        when 'pick' then id = any(v_link.picked_creatives)
        else false
      end
    );
$$;

create or replace function get_shared_review(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_project jsonb;
  v_creatives jsonb;
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

  v_allowed_ids := shared_link_allowed_creative_ids(v_link);

  select jsonb_build_object('id', p.id, 'name', p.name, 'delivery', p.delivery)
    into v_project
    from projects p where p.id = v_link.project_id;

  select coalesce(jsonb_agg(c order by c.position), '[]'::jsonb) into v_creatives
  from (
    select
      cr.id, cr.name, cr.format, cr.stage, cr.position,
      cr.scheduled_at, cr.destination, cr.approved_at,
      (
        select jsonb_build_object(
          'version_no', cv.version_no, 'storage_key', a.storage_key,
          'mime_type', a.mime_type, 'filename', a.filename
        )
        from creative_versions cv join assets a on a.id = cv.asset_id
        where cv.creative_id = cr.id order by cv.version_no desc limit 1
      ) as asset,
      (
        select jsonb_build_object('version_no', cpv.version_no, 'fields', cpv.fields)
        from copy_versions cpv
        where cpv.creative_id = cr.id order by cpv.version_no desc limit 1
      ) as copy,
      (
        -- Public, non-deleted only — this is the strip that matters. Private
        -- comments and anything soft-deleted are never fetched, so there is
        -- no "filter it out before sending" step for a bug to skip.
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', cm.id,
          'author_name', coalesce(u.name, cm.guest_name),
          'body', cm.body,
          'created_at', cm.created_at
        ) order by cm.created_at), '[]'::jsonb)
        from comments cm left join users u on u.id = cm.author_id
        where cm.creative_id = cr.id and cm.visibility = 'public' and cm.deleted_at is null
      ) as comments
    from creatives cr
    where cr.id = any(v_allowed_ids)
  ) c;

  return jsonb_build_object(
    'status', 'ok',
    'scope', v_link.scope,
    'can_approve', v_link.can_approve,
    'project', v_project,
    'creatives', v_creatives
  );
end;
$$;

grant execute on function get_shared_review(text, text) to anon, authenticated;

create or replace function submit_shared_comment(
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
  if p_body is null or trim(p_body) = '' then
    return jsonb_build_object('status', 'body_required');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (p_creative_id, trim(p_body), trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public');

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function submit_shared_comment(text, text, uuid, text, text, text) to anon, authenticated;

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
  set stage = 6,
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

grant execute on function submit_shared_approval(text, text, uuid, text, text) to anon, authenticated;
