-- Phase 62 — only the team's Users are added to a client from its People.
--
-- Decided directly (6 Oct 2026), replacing part of phase59: a client's
-- people are that client's own, invited from its settings. Picking someone
-- who has already joined is for the agency's Users only (giving them this
-- client); a Client of another client is never added here. Owners and
-- Admins see every client already, so they aren't either.

create or replace function add_person_to_client(p_user_id uuid, p_client_id uuid, p_project_ids uuid[] default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency uuid;
  v_staff memberships%rowtype;
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
  if not found then
    raise exception 'Only Users on your team can be added. Invite someone from the client instead.' using errcode = '22023';
  end if;
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

  if p_project_ids is not null then
    delete from project_access pa using projects p
    where pa.membership_id = v_staff.id and p.id = pa.project_id
      and p.client_id = p_client_id and not (p.id = any (p_project_ids));
  end if;
  return v_staff.id;
end;
$$;
