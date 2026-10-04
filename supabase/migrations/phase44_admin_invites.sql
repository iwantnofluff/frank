-- Phase 44 — an Owner can let an Admin invite people.
--
-- Decided directly (4 Oct 2026): inviting stays an Owner's (phase24), but an
-- Owner can switch "Can invite people" on for an Admin. That Admin invites
-- Admins, Users and Clients — never an Owner — and can't hand the switch on.
-- Changing anyone's role, access or switch afterwards stays an Owner's.
--
-- A Client is a membership tied to one client (client_id set, role 'user'),
-- as client-side people have always been: they see that client's work and
-- its public comments only, and don't count as a team member.

alter table memberships add column can_invite boolean not null default false;

-- The caller can invite people into this agency: an Owner or the Primary
-- Owner, or an active Admin whose switch is on.
create or replace function can_invite_people(check_agency_id uuid)
returns boolean
language sql security definer stable set search_path = public, extensions as $$
  select is_agency_owner_or_above(check_agency_id) or exists (
    select 1 from memberships
    where agency_id = check_agency_id
      and user_id = auth.uid()
      and role = 'admin'
      and can_invite
      and client_id is null
      and removed_at is null
      and accepted_at is not null
      and in_request_agency(check_agency_id)
  );
$$;

-- Adding someone. An Owner as before; an inviting Admin only as Admin or
-- User (a Client is a User tied to a client), not yet accepted, and
-- without the switch.
drop policy memberships_insert on memberships;
create policy memberships_insert on memberships
  for insert with check (
    (is_agency_owner_or_above(agency_id) and role <> 'primary_owner')
    or (
      can_invite_people(agency_id)
      and role in ('admin', 'user')
      and not can_invite
      and accepted_at is null
      and invited_by = auth.uid()
    )
  );

-- Giving a new invitee access to clients: an Owner for anyone, as before;
-- an inviting Admin only for the invites they've just made.
drop policy staff_client_access_insert on staff_client_access;
create policy staff_client_access_insert on staff_client_access
  for insert with check (
    is_agency_owner_or_above(agency_id)
    or (
      can_invite_people(agency_id)
      and exists (
        select 1 from memberships m
        where m.id = membership_id and m.invited_by = auth.uid() and m.accepted_at is null
      )
    )
  );

-- The invite links: an inviting Admin sees, makes and replaces their own.
drop policy invites_select on invites;
create policy invites_select on invites
  for select using (is_agency_owner_or_above(agency_id) or (can_invite_people(agency_id) and created_by = auth.uid()));
drop policy invites_insert on invites;
create policy invites_insert on invites
  for insert with check (can_invite_people(agency_id) and created_by = auth.uid());
drop policy invites_delete on invites;
create policy invites_delete on invites
  for delete using (
    accepted_at is null
    and (is_agency_owner_or_above(agency_id) or (can_invite_people(agency_id) and created_by = auth.uid()))
  );
