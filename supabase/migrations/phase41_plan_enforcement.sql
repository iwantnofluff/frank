-- Phase 41 — what a plan allows, enforced (the spec, v11 §5; decided
-- directly, 3 Oct 2026):
--   1. A new agency starts on Free, with Free's limits.
--   2. Free is a 30-day trial; after it, the agency is read-only until it
--      moves to a paid plan. A paid plan that's cancelled drops to Free
--      after its period, and so is read-only too (the spec: "on
--      cancellation… enters read-only mode").
--   3. Storage is limited by plan, counted from the files actually stored.
--   4. An agency's address can change (Owners, Agency plan and up); the old
--      one is kept, so nobody else can take it, and redirects to the new.
--
-- The service role (Paddle's webhook, the admin area, clean-up) isn't held
-- to 2 or 3: those are about what an agency's people can do.

-- 1. New agencies: Free, 1 client, 2 team members, 500 MB.
alter table agencies alter column plan set default 'free';
alter table agencies alter column client_limit set default 1;
alter table agencies alter column seat_limit set default 2;

-- 2. The trial. Set when an agency is created; only read while on Free.
--    Existing agencies have none, so one of them on Free is read-only.
alter table agencies add column trial_ends_at timestamptz;
alter table agencies alter column trial_ends_at set default now() + interval '30 days';

create or replace function agency_read_only(check_agency_id uuid)
returns boolean
language sql security definer stable set search_path = public, extensions as $$
  select exists (
    select 1 from agencies a
    where a.id = check_agency_id
      and a.plan = 'free'
      and coalesce(a.trial_ends_at, '-infinity'::timestamptz) <= now()
  );
$$;

-- People signed in, and review-link visitors (through the shared-review
-- functions), are who read-only holds back. Anything else — the service
-- role, a migration — isn't a person using the agency.
create or replace function acting_as_person()
returns boolean
language sql stable set search_path = public, extensions as $$
  select coalesce(auth.role(), '') in ('authenticated', 'anon');
$$;

create or replace function block_writes_when_read_only()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency uuid;
begin
  if not acting_as_person() then return coalesce(new, old); end if;
  v_agency := case when tg_op = 'DELETE' then old.agency_id else new.agency_id end;
  if agency_read_only(v_agency) then
    raise exception 'agency is read-only (trial ended)';
  end if;
  return coalesce(new, old);
end;
$$;

-- Named to fire last among each table's BEFORE triggers (they run in name
-- order), so a child row's agency_id has already been derived from its
-- parent (set_agency_id_from_*) when it's checked.
do $$
declare
  t text;
begin
  foreach t in array array[
    'agency_knowledge_entries', 'agency_settings', 'assets', 'calendar_views',
    'client_contacts', 'clients', 'comments', 'copy_versions',
    'creative_version_slides', 'creative_versions', 'creatives', 'custom_columns',
    'format_directions', 'invites', 'knowledge_entries', 'project_folders',
    'projects', 'shared_links', 'staff_client_access'
  ] loop
    execute format(
      'create trigger zz_read_only_guard before insert or update or delete on %I
         for each row execute function block_writes_when_read_only()', t);
  end loop;
end;
$$;

-- 3. Storage. null is unlimited (Enterprise: custom).
alter table agencies add column storage_limit_bytes bigint default 524288000
  check (storage_limit_bytes is null or storage_limit_bytes >= 0);
update agencies set storage_limit_bytes = case plan
  when 'free' then 524288000          -- 500 MB
  when 'starter' then 5368709120      -- 5 GB
  when 'growth' then 26843545600      -- 25 GB
  when 'agency' then 80530636800      -- 75 GB
  else null
end;

-- What an agency has stored: every file under its folder in the assets
-- bucket, at the size Storage recorded (not what the browser claimed).
create or replace function agency_storage_used(check_agency_id uuid)
returns bigint
language sql security definer stable set search_path = public, extensions as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'assets' and o.name like check_agency_id::text || '/%'
    and (not acting_as_person() or is_agency_staff(check_agency_id));
$$;
-- The agency's own people see its usage (Plans page); nobody else's.
revoke execute on function agency_storage_used(uuid) from public, anon;
grant execute on function agency_storage_used(uuid) to authenticated;

create or replace function enforce_storage_limits()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency uuid;
  v_limit bigint;
  v_size bigint;
  v_used bigint;
begin
  if new.bucket_id <> 'assets' then return new; end if;
  begin
    v_agency := (storage.foldername(new.name))[1]::uuid;
  exception when others then
    return new;
  end;
  -- Storage first tests the upload as the person, with a row that has no
  -- size yet (rolled back): that's where read-only stops it.
  if acting_as_person() and agency_read_only(v_agency) then
    raise exception 'agency is read-only (trial ended)';
  end if;
  -- Then it writes the stored file's row itself (as supabase_storage_admin,
  -- with the size it measured): that's where the limit is checked. A row
  -- written any other way (a migration, the SQL editor) isn't an upload.
  v_size := nullif(new.metadata ->> 'size', '')::bigint;
  if v_size is null or session_user <> 'supabase_storage_admin' then return new; end if;
  select storage_limit_bytes into v_limit from agencies where id = v_agency;
  if v_limit is null then return new; end if;
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into v_used
  from storage.objects o
  where o.bucket_id = 'assets' and o.name like v_agency::text || '/%' and o.id <> new.id;
  if v_used + v_size > v_limit then
    raise exception 'storage limit reached (%)', v_limit;
  end if;
  return new;
end;
$$;

create trigger zz_enforce_storage_limits before insert or update on storage.objects
  for each row execute function enforce_storage_limits();

-- 4. Addresses an agency used to have. Kept so a link sent with one still
--    reaches the agency, and so no other agency can take it. An agency can
--    go back to one of its own.
create table agency_previous_subdomains (
  subdomain citext primary key,
  agency_id uuid not null references agencies (id) on delete cascade,
  retired_at timestamptz not null default now()
);
alter table agency_previous_subdomains enable row level security;
-- Service role only (the address change, the redirect below): no policies.

-- Changes an agency's address, keeping the old one. Service role only:
-- the route checks who's asking (an Owner, on Agency or Enterprise).
create or replace function change_agency_subdomain(p_agency_id uuid, p_subdomain text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_old citext;
begin
  select subdomain into v_old from agencies where id = p_agency_id for update;
  if not found then raise exception 'no such agency'; end if;
  if v_old = p_subdomain::citext then return; end if;
  if exists (
    select 1 from agency_previous_subdomains
    where subdomain = p_subdomain::citext and agency_id <> p_agency_id
  ) then
    raise exception 'subdomain previously used by another agency';
  end if;
  delete from agency_previous_subdomains where subdomain = p_subdomain::citext;
  update agencies set subdomain = p_subdomain::citext where id = p_agency_id;
  if v_old is not null then
    insert into agency_previous_subdomains (subdomain, agency_id) values (v_old, p_agency_id)
    on conflict (subdomain) do update set agency_id = excluded.agency_id, retired_at = now();
  end if;
end;
$$;
revoke execute on function change_agency_subdomain(uuid, text) from public, anon, authenticated;

-- However an address is set (a new agency, the admin area), it can't be one
-- another agency used to have.
create or replace function protect_previous_subdomains()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.subdomain is not null and exists (
    select 1 from agency_previous_subdomains
    where subdomain = new.subdomain and agency_id <> new.id
  ) then
    raise exception 'subdomain previously used by another agency';
  end if;
  return new;
end;
$$;
create trigger protect_previous_subdomains before insert or update of subdomain on agencies
  for each row execute function protect_previous_subdomains();

-- Where an old address now lives, for the redirect. Public (signed-out
-- visitors follow old links too); says only the current address.
create or replace function current_subdomain_for(p_subdomain text)
returns text
language sql security definer stable set search_path = public, extensions as $$
  select a.subdomain::text
  from agency_previous_subdomains p
  join agencies a on a.id = p.agency_id
  where p.subdomain = p_subdomain::citext and a.archived_at is null and a.subdomain is not null;
$$;
grant execute on function current_subdomain_for(text) to anon, authenticated;
