-- Phase 74 — Owners delete archived clients and projects for good.
--
-- Decided directly (8 Oct 2026): the Primary Owner and Owners (not Admins
-- or Users) can permanently delete a client or project once it's archived.
-- Archiving stays the reversible step. Deleting takes everything under it:
-- projects, posts, versions, comments, Draft with Frank chats, review links,
-- notifications, the stage log; for a client also its knowledge, client
-- team list, folders, preferences and Instagram connection. Its own
-- people lose their access to the agency (their memberships at it go);
-- their Frank logins stay. Confirmed in the app by typing the name.
--
-- Each function checks the caller and that the thing is archived, deletes
-- in one go (all or nothing), and returns what storage holds for it: the
-- files of the assets it freed, and each post's folder, for the route to
-- remove with the service role (no signed-in role can delete storage).

-- What deleting would remove, for the confirmation window.
create or replace function delete_permanently_counts(p_kind text, p_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_agency uuid;
  v_projects uuid[];
begin
  if p_kind = 'client' then
    select agency_id into v_agency from clients where id = p_id;
    select coalesce(array_agg(id), '{}') into v_projects from projects where client_id = p_id;
  elsif p_kind = 'project' then
    select agency_id into v_agency from projects where id = p_id;
    v_projects := array[p_id];
  else
    raise exception 'unknown kind';
  end if;
  if v_agency is null then raise exception 'not found'; end if;
  if not is_agency_owner_or_above(v_agency) then raise exception 'not permitted'; end if;

  return jsonb_build_object(
    'projects', cardinality(v_projects),
    'posts', (select count(*) from creatives where project_id = any(v_projects)),
    'comments', (select count(*) from comments cm join creatives c on c.id = cm.creative_id where c.project_id = any(v_projects)),
    'files', (
      select count(distinct a) from (
        select cv.asset_id a from creative_versions cv join creatives c on c.id = cv.creative_id where c.project_id = any(v_projects) and cv.asset_id is not null
        union
        select s.asset_id from creative_version_slides s join creative_versions cv on cv.id = s.creative_version_id join creatives c on c.id = cv.creative_id where c.project_id = any(v_projects)
      ) x
    ),
    'people', case when p_kind = 'client' then (select count(*) from memberships where client_id = p_id and removed_at is null) else 0 end
  );
end;
$$;
grant execute on function delete_permanently_counts(text, uuid) to authenticated;

-- The shared part: a set of projects and everything under them. Not
-- callable by anyone directly; the two functions below check first.
create or replace function purge_projects(p_project_ids uuid[], out creative_ids uuid[], out asset_ids uuid[])
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(array_agg(id), '{}') into creative_ids from creatives where project_id = any(p_project_ids);
  select coalesce(array_agg(distinct a), '{}') into asset_ids from (
    select asset_id a from creative_versions where creative_id = any(creative_ids) and asset_id is not null
    union
    select s.asset_id from creative_version_slides s join creative_versions cv on cv.id = s.creative_version_id
    where cv.creative_id = any(creative_ids)
  ) x;

  update comments set copy_version_id = null, creative_version_id = null where creative_id = any(creative_ids);
  update copy_versions set source_comment_id = null where creative_id = any(creative_ids);
  delete from comments where creative_id = any(creative_ids);
  delete from copy_versions where creative_id = any(creative_ids);
  delete from creative_versions where creative_id = any(creative_ids); -- slides go with them
  delete from shared_links where creative_id = any(creative_ids) or project_id = any(p_project_ids);
  delete from creatives where id = any(creative_ids); -- chats, notifications, stage log go with them
  delete from custom_columns where project_id = any(p_project_ids);
  delete from projects where id = any(p_project_ids); -- project access goes with them
end;
$$;
revoke execute on function purge_projects(uuid[]) from public, anon, authenticated;

-- Assets nothing points at any more, deleted; their files' paths returned.
create or replace function purge_unused_assets(p_asset_ids uuid[])
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_keys text[];
begin
  with gone as (
    delete from assets a
    where a.id = any(p_asset_ids)
      and not exists (select 1 from creative_versions where asset_id = a.id)
      and not exists (select 1 from creative_version_slides where asset_id = a.id)
      and not exists (select 1 from knowledge_entries where asset_id = a.id)
      and not exists (select 1 from agency_knowledge_entries where asset_id = a.id)
      and not exists (select 1 from clients where logo_asset_id = a.id)
      and not exists (select 1 from agency_settings where logo_asset_id = a.id)
      and not exists (select 1 from users where avatar_asset_id = a.id)
    returning a.storage_key
  )
  select coalesce(array_agg(storage_key), '{}') into v_keys from gone;
  return v_keys;
end;
$$;
revoke execute on function purge_unused_assets(uuid[]) from public, anon, authenticated;

create or replace function delete_project_permanently(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_project projects%rowtype;
  v_purge record;
begin
  select * into v_project from projects where id = p_project_id;
  if not found then raise exception 'not found'; end if;
  if not is_agency_owner_or_above(v_project.agency_id) then raise exception 'not permitted'; end if;
  if v_project.archived_at is null then raise exception 'archive it first'; end if;

  select * into v_purge from purge_projects(array[p_project_id]);
  return jsonb_build_object(
    'agency_id', v_project.agency_id,
    'creative_ids', to_jsonb(v_purge.creative_ids),
    'keys', to_jsonb(purge_unused_assets(v_purge.asset_ids))
  );
end;
$$;
grant execute on function delete_project_permanently(uuid) to authenticated;

create or replace function delete_client_permanently(p_client_id uuid)
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
  if not is_agency_owner_or_above(v_client.agency_id) then raise exception 'not permitted'; end if;
  if v_client.archived_at is null then raise exception 'archive it first'; end if;

  select coalesce(array_agg(id), '{}') into v_projects from projects where client_id = p_client_id;
  select * into v_purge from purge_projects(v_projects);

  -- Its knowledge files and logo, as well as the posts'.
  select coalesce(array_agg(asset_id), '{}') into v_assets from knowledge_entries where client_id = p_client_id and asset_id is not null;
  v_assets := v_purge.asset_ids || v_assets || coalesce(array[v_client.logo_asset_id], '{}');

  -- Its own people lose access to the agency; their logins stay.
  delete from memberships where client_id = p_client_id; -- their invites and project access go with them
  delete from knowledge_entries where client_id = p_client_id;
  delete from client_contacts where client_id = p_client_id;
  update projects set folder_id = null where folder_id in (select id from project_folders where client_id = p_client_id);
  delete from project_folders where client_id = p_client_id;
  delete from clients where id = p_client_id; -- preferences, Instagram, staff access go with it

  return jsonb_build_object(
    'agency_id', v_client.agency_id,
    'client_id', p_client_id,
    'creative_ids', to_jsonb(v_purge.creative_ids),
    'keys', to_jsonb(purge_unused_assets(v_assets))
  );
end;
$$;
grant execute on function delete_client_permanently(uuid) to authenticated;
