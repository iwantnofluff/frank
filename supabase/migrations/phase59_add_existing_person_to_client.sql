-- Phase 59 — adding someone who has already joined to another client.
--
-- Decided directly (6 Oct 2026): from a client's People, whoever can invite
-- picks someone already in the agency — a Client of another client, or a
-- User on the team — and they're on this client straight away, with no
-- invite link (they've accepted one already).
--
-- - A Client gets a second Client membership, for this client, accepted
--   now. One person on several clients was already allowed (one membership
--   per client: unique (agency_id, user_id, client_id)).
-- - A User gets this client in their client access (staff_client_access).
-- - Owners and Admins see every client already, so they're never added.
--
-- Either way the triggers put them on every project of the client; with
-- p_project_ids, only those of this client's projects stay.

create or replace function add_person_to_client(p_user_id uuid, p_client_id uuid, p_project_ids uuid[] default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency uuid;
  v_staff memberships%rowtype;
  v_existing memberships%rowtype;
  v_membership uuid;
begin
  select agency_id into v_agency from clients where id = p_client_id and archived_at is null;
  if v_agency is null then
    raise exception 'Choose a client' using errcode = '22023';
  end if;
  if not can_invite_people(v_agency) then
    raise exception 'You can''t add people to this agency. Ask an Owner.' using errcode = '42501';
  end if;
  if agency_read_only(v_agency) then
    raise exception 'Your agency is read-only. Choose a plan in Settings to carry on.' using errcode = '42501';
  end if;

  select * into v_staff from memberships
  where agency_id = v_agency and user_id = p_user_id and client_id is null
    and removed_at is null and accepted_at is not null;

  if found then
    if v_staff.role <> 'user' then
      raise exception 'Owners and Admins already see every client' using errcode = '22023';
    end if;
    if not can_manage_member(v_staff.id) then
      raise exception 'You can only add people below you' using errcode = '42501';
    end if;
    if exists (select 1 from staff_client_access where membership_id = v_staff.id and client_id = p_client_id) then
      raise exception 'They''re already on this client' using errcode = '23505';
    end if;
    insert into staff_client_access (membership_id, client_id) values (v_staff.id, p_client_id);
    v_membership := v_staff.id;
  else
    -- A Client elsewhere in this agency, who has joined.
    if not exists (
      select 1 from memberships
      where agency_id = v_agency and user_id = p_user_id and client_id is not null
        and removed_at is null and accepted_at is not null
    ) then
      raise exception 'Only people who have joined can be added. Invite them instead.' using errcode = '22023';
    end if;
    select * into v_existing from memberships
    where agency_id = v_agency and user_id = p_user_id and client_id = p_client_id;
    if found then
      if v_existing.removed_at is not null then
        raise exception 'They were deactivated on this client. Reactivate them from the Team list instead.' using errcode = '23505';
      end if;
      raise exception 'They''re already on this client' using errcode = '23505';
    end if;
    insert into memberships (agency_id, user_id, role, client_id, invited_by, invited_at, accepted_at)
    values (v_agency, p_user_id, 'user', p_client_id, auth.uid(), now(), now())
    returning id into v_membership;
  end if;

  if p_project_ids is not null then
    delete from project_access pa using projects p
    where pa.membership_id = v_membership and p.id = pa.project_id
      and p.client_id = p_client_id and not (p.id = any (p_project_ids));
  end if;
  return v_membership;
end;
$$;

revoke execute on function add_person_to_client(uuid, uuid, uuid[]) from public, anon;
grant execute on function add_person_to_client(uuid, uuid, uuid[]) to authenticated;
