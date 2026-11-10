-- Phase 145 — a sample client in every new workspace.
--
-- Decided directly (10 Nov 2026): each new workspace gets a made-up
-- skincare client, Lumen Skin, with a Content Planner and posts across the
-- stages, to explore Frank with. It's marked as a sample everywhere, doesn't
-- count towards the client or storage limits, sends nothing to anyone
-- outside the workspace, and is removed for good 7 days after the
-- workspace's first visit, or sooner from its Remove button. AI used on it
-- counts as normal. It's made by the sign-up route (lib/sample/seed.ts), with
-- the service role; its files sit under {agency_id}/sample/.

alter table clients
  add column if not exists is_sample boolean not null default false,
  -- Set on the workspace's first visit (start_sample_clock); null until then.
  add column if not exists sample_expires_at timestamptz;

-- 1. The client limit leaves samples out: one can be made over the limit,
--    and it doesn't count towards anyone else's place.
create or replace function enforce_client_limit()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_limit int;
  v_count int;
begin
  if new.is_sample then return new; end if;
  if new.archived_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.archived_at is null and old.agency_id = new.agency_id then return new; end if;
  select client_limit into v_limit from agencies where id = new.agency_id;
  if v_limit is null then return new; end if;
  select count(*) into v_count from clients
  where agency_id = new.agency_id and archived_at is null and not is_sample and id <> new.id;
  if v_count >= v_limit then
    raise exception 'client limit reached (%)', v_limit;
  end if;
  return new;
end;
$$;

-- 2. Storage leaves the sample's folder out, in what's shown as used and in
--    the limit checked on upload.
create or replace function agency_storage_used(check_agency_id uuid)
returns bigint
language sql security definer stable set search_path = public, extensions as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'assets' and o.name like check_agency_id::text || '/%'
    and o.name not like check_agency_id::text || '/sample/%'
    and (not acting_as_person() or is_agency_staff(check_agency_id));
$$;

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
  -- The sample's own files don't count (phase145).
  if new.name like v_agency::text || '/sample/%' then return new; end if;
  -- Then it writes the stored file's row itself (as supabase_storage_admin,
  -- with the size it measured): that's where the limit is checked. A row
  -- written any other way (a migration, the SQL editor) isn't an upload.
  v_size := nullif(new.metadata ->> 'size', '')::bigint;
  if v_size is null or session_user <> 'supabase_storage_admin' then return new; end if;
  select storage_limit_bytes into v_limit from agencies where id = v_agency;
  if v_limit is null then return new; end if;
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into v_used
  from storage.objects o
  where o.bucket_id = 'assets' and o.name like v_agency::text || '/%'
    and o.name not like v_agency::text || '/sample/%' and o.id <> new.id;
  if v_used + v_size > v_limit then
    raise exception 'storage limit reached (%)', v_limit;
  end if;
  return new;
end;
$$;

-- 3. The 7 days start on the workspace's first visit: called as the app
--    opens, by its team. Only sets a sample's date once.
create or replace function start_sample_clock()
returns void
language sql security definer set search_path = public, extensions as $$
  update clients
     set sample_expires_at = now() + interval '7 days'
   where is_sample
     and sample_expires_at is null
     and agency_id in (select current_agency_ids())
     and is_agency_staff(agency_id);
$$;
revoke execute on function start_sample_clock() from public, anon;
grant execute on function start_sample_clock() to authenticated;

-- 4. Removing a sample for good: its Remove button (Owners and Admins), or
--    the daily clean-up once it's expired (the service role). As
--    delete_client_permanently (phase74), without its archive-first rule,
--    and only ever for a sample. Returns what the route removes from storage.
create or replace function delete_sample_client(p_client_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_client clients%rowtype;
  v_projects uuid[];
  v_purge record;
  v_assets uuid[];
begin
  select * into v_client from clients where id = p_client_id;
  if not found then raise exception 'not found'; end if;
  if not v_client.is_sample then raise exception 'not a sample'; end if;
  if auth.uid() is not null and not is_agency_admin(v_client.agency_id) then raise exception 'not permitted'; end if;
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'not permitted'; end if;

  select coalesce(array_agg(id), '{}') into v_projects from projects where client_id = p_client_id;
  select * into v_purge from purge_projects(v_projects);

  select coalesce(array_agg(asset_id), '{}') into v_assets from knowledge_entries where client_id = p_client_id and asset_id is not null;
  v_assets := v_purge.asset_ids || v_assets || coalesce(array[v_client.logo_asset_id], '{}');

  delete from memberships where client_id = p_client_id;
  delete from knowledge_entries where client_id = p_client_id;
  delete from client_contacts where client_id = p_client_id;
  update projects set folder_id = null where folder_id in (select id from project_folders where client_id = p_client_id);
  delete from project_folders where client_id = p_client_id;
  delete from clients where id = p_client_id;

  return jsonb_build_object(
    'agency_id', v_client.agency_id,
    'client_id', p_client_id,
    'creative_ids', to_jsonb(v_purge.creative_ids),
    'keys', to_jsonb(purge_unused_assets(v_assets))
  );
end;
$$;
revoke execute on function delete_sample_client(uuid) from public, anon;
grant execute on function delete_sample_client(uuid) to authenticated, service_role;

-- So the API sees the new columns straight away.
notify pgrst, 'reload schema';
