-- Phase 146 — the sample client is hidden, never deleted.
--
-- Decided directly (10 Nov 2026): Frank Tour and Help's Show Me always use
-- the workspace's sample client, Lumen Skin, so it must always be there.
-- After its 7 days, or from its Hide button, it's hidden (archived, which
-- every list, count and search already leaves out), not deleted. Nobody can
-- delete it; Reset in Preferences (and the tour, when something it needs is
-- missing) puts it back as it was, through the service role. Every User on
-- the team can see it, so their tour can use it.

-- 1. Nobody deletes it from Frank: Remove Now is now Hide, and the archived
--    client's Delete Permanently refuses a sample. The service role's reset
--    still uses delete_sample_client (phase145), then makes it again.
revoke execute on function delete_sample_client(uuid) from authenticated;

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
  if v_client.is_sample then raise exception 'the sample client is never deleted'; end if;
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

-- 2. Every User on the team sees the sample: given it when it's made, and
--    whenever someone joins (or becomes a User). Owners and Admins see
--    every client already.
create or replace function grant_sample_to_users()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_table_name = 'clients' then
    if new.is_sample then
      insert into staff_client_access (agency_id, membership_id, client_id)
      select m.agency_id, m.id, new.id
        from memberships m
       where m.agency_id = new.agency_id and m.client_id is null and m.role = 'user' and m.removed_at is null
      on conflict (membership_id, client_id) do nothing;
    end if;
  elsif new.client_id is null and new.role = 'user' and new.removed_at is null then
    insert into staff_client_access (agency_id, membership_id, client_id)
    select new.agency_id, new.id, c.id
      from clients c
     where c.agency_id = new.agency_id and c.is_sample
    on conflict (membership_id, client_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_grant_sample on clients;
create trigger clients_grant_sample after insert on clients
  for each row execute function grant_sample_to_users();
drop trigger if exists memberships_grant_sample on memberships;
create trigger memberships_grant_sample after insert or update of role, removed_at on memberships
  for each row execute function grant_sample_to_users();

-- The Users already on teams with a sample.
insert into staff_client_access (agency_id, membership_id, client_id)
select m.agency_id, m.id, c.id
  from memberships m
  join clients c on c.agency_id = m.agency_id and c.is_sample
 where m.client_id is null and m.role = 'user' and m.removed_at is null
on conflict (membership_id, client_id) do nothing;

notify pgrst, 'reload schema';
