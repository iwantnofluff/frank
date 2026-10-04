-- Phase 49 — everyone manages the people below them.
--
-- Decided directly (4 Oct 2026): the Primary Owner changes Owners, Admins,
-- Users and Clients; an Owner, Admins, Users and Clients; an Admin, Users
-- and Clients. Changing someone's type includes moving them between User
-- (on the team) and Client (someone at a client), keeping their projects.
-- Resending and removing a pending invite follow the same line, for Admins
-- too. Deactivating and removing people, and the "Can invite" switch, stay
-- an Owner's in the app (phase24/44).

-- 1. Rank: lower is more senior. A Client is a 'user' tied to a client.
create or replace function role_rank(p_role agency_role)
returns int
language sql immutable as $$
  select case p_role
    when 'primary_owner' then 0
    when 'owner' then 1
    when 'admin' then 2
    else 3
  end;
$$;

-- The caller's rank in this agency, or null if they don't manage anyone.
create or replace function my_rank(check_agency_id uuid)
returns int
language sql security definer stable set search_path = public, extensions as $$
  select min(role_rank(role)) from memberships
  where agency_id = check_agency_id
    and user_id = auth.uid()
    and client_id is null
    and removed_at is null
    and accepted_at is not null
    and role in ('primary_owner', 'owner', 'admin')
    and in_request_agency(check_agency_id);
$$;

-- The caller can manage this membership: it's below them in their agency.
create or replace function can_manage_member(p_membership_id uuid)
returns boolean
language sql security definer stable set search_path = public, extensions as $$
  select exists (
    select 1 from memberships m
    where m.id = p_membership_id
      and m.user_id <> auth.uid()
      and role_rank(m.role) > my_rank(m.agency_id)
  );
$$;

-- 2. Changing a membership: one below you, to a role still below you. Only
--    an Owner hands out "Can invite" (phase44).
drop policy memberships_update on memberships;
create policy memberships_update on memberships
  for update
  using (
    current_setting('frank.ownership_transfer_in_progress', true) = 'true'
    or can_manage_member(id)
  )
  with check (
    current_setting('frank.ownership_transfer_in_progress', true) = 'true'
    or (
      role_rank(role) > my_rank(agency_id)
      and (not can_invite or is_agency_owner_or_above(agency_id))
    )
  );

-- Removing: an Owner as before, now only those below them; an Admin only a
-- pending invite below them.
drop policy memberships_delete on memberships;
create policy memberships_delete on memberships
  for delete using (
    can_manage_member(id)
    and (is_agency_owner_or_above(agency_id) or accepted_at is null)
  );

-- A User's clients, for whoever manages them (and the inviting Admin's own
-- new invites, phase44).
drop policy staff_client_access_insert on staff_client_access;
create policy staff_client_access_insert on staff_client_access
  for insert with check (
    can_manage_member(membership_id)
    or (
      can_invite_people(agency_id)
      and exists (
        select 1 from memberships m
        where m.id = membership_id and m.invited_by = auth.uid() and m.accepted_at is null
      )
    )
  );
drop policy staff_client_access_delete on staff_client_access;
create policy staff_client_access_delete on staff_client_access
  for delete using (can_manage_member(membership_id));

-- 3. Invite links: resent (old one removed, new one made) by whoever
--    manages the person, as well as by their inviter.
drop policy invites_select on invites;
create policy invites_select on invites
  for select using (
    is_agency_owner_or_above(agency_id)
    or can_manage_member(membership_id)
    or (can_invite_people(agency_id) and created_by = auth.uid())
  );
drop policy invites_insert on invites;
create policy invites_insert on invites
  for insert with check (
    created_by = auth.uid()
    and (can_invite_people(agency_id) or can_manage_member(membership_id))
  );
drop policy invites_delete on invites;
create policy invites_delete on invites
  for delete using (
    accepted_at is null
    and (
      can_manage_member(membership_id)
      or (can_invite_people(agency_id) and created_by = auth.uid())
    )
  );

-- 4. A Client leaving their client (to become a User, or anything else)
--    comes off its review link's list; one arriving goes on (phase45).
create or replace function sync_client_contact_from_membership()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text;
  v_email text;
begin
  select coalesce(nullif(btrim(u.name), ''), u.email), u.email into v_name, v_email
  from users u where u.id = new.user_id;
  if v_email is null then return new; end if;

  if tg_op = 'UPDATE' and old.client_id is not null and old.client_id is distinct from new.client_id then
    update client_contacts set archived_at = coalesce(archived_at, now())
    where client_id = old.client_id and lower(email) = lower(v_email);
  end if;

  if new.client_id is null then return new; end if;

  if new.removed_at is not null then
    update client_contacts set archived_at = coalesce(archived_at, now())
    where client_id = new.client_id and lower(email) = lower(v_email);
    return new;
  end if;

  update client_contacts set name = v_name, archived_at = null
  where client_id = new.client_id and lower(email) = lower(v_email);
  if not found then
    insert into client_contacts (agency_id, client_id, name, email)
    values (new.agency_id, new.client_id, v_name, v_email);
  end if;
  return new;
end;
$$;

drop trigger sync_client_contact on memberships;
create trigger sync_client_contact
  after insert or update of accepted_at, removed_at, client_id on memberships
  for each row execute function sync_client_contact_from_membership();

-- 5. Changing someone's type: 'owner', 'admin', 'user', or 'client' (of
--    p_client_id). Checks the same line as the policies, then keeps their
--    clients and projects in step:
--    - User to Client of one of their clients: that client's projects they
--      were on stay; the rest go.
--    - Client to User: given their client, on the same projects as before.
--    - To Owner or Admin: grants cleared (they see everything).
create or replace function change_member_type(p_membership_id uuid, p_type text, p_client_id uuid default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  m memberships%rowtype;
  v_role agency_role;
  v_was_client uuid;
  v_projects uuid[];
begin
  select * into m from memberships where id = p_membership_id;
  if not found or not can_manage_member(p_membership_id) then
    raise exception 'You can only change people below you' using errcode = '42501';
  end if;
  if p_type not in ('owner', 'admin', 'user', 'client') then
    raise exception 'Unknown type %', p_type using errcode = '22023';
  end if;
  v_role := case when p_type = 'client' then 'user' else p_type end::agency_role;
  if role_rank(v_role) <= my_rank(m.agency_id) then
    raise exception 'You can only give a role below your own' using errcode = '42501';
  end if;
  if p_type = 'client' and not exists (
    select 1 from clients where id = p_client_id and agency_id = m.agency_id
  ) then
    raise exception 'Choose their client' using errcode = '22023';
  end if;

  v_was_client := m.client_id;
  select coalesce(array_agg(project_id), '{}') into v_projects
  from project_access where membership_id = m.id;

  if p_type = 'client' then
    -- Taking away their grants also takes them off those projects
    -- (project_access_from_client_grant), so they're put back after.
    delete from staff_client_access where membership_id = m.id;
    update memberships set role = 'user', client_id = p_client_id, can_invite = false where id = m.id;
    delete from project_access pa using projects p
    where pa.membership_id = m.id and p.id = pa.project_id and p.client_id <> p_client_id;
    insert into project_access (membership_id, project_id)
    select m.id, p.id from projects p
    where p.client_id = p_client_id and p.id = any (v_projects)
    on conflict (membership_id, project_id) do nothing;
    -- On none of this client's projects before: every one, as a new
    -- Client would get.
    if not exists (select 1 from project_access where membership_id = m.id) then
      insert into project_access (membership_id, project_id)
      select m.id, p.id from projects p where p.client_id = p_client_id
      on conflict (membership_id, project_id) do nothing;
    end if;
  elsif v_role = 'user' then
    update memberships set role = 'user', client_id = null, can_invite = false where id = m.id;
    if v_was_client is not null then
      insert into staff_client_access (membership_id, client_id)
      values (m.id, v_was_client)
      on conflict do nothing;
      -- The grant puts them on every project of it; back to what they had.
      delete from project_access
      where membership_id = m.id and not (project_id = any (v_projects));
    end if;
  else
    delete from staff_client_access where membership_id = m.id;
    delete from project_access where membership_id = m.id;
    update memberships set role = v_role, client_id = null,
      can_invite = case when v_role = 'admin' then m.can_invite else false end
    where id = m.id;
  end if;
end;
$$;
