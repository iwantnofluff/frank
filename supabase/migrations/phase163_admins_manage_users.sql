-- Phase 163 — every Admin adds, edits and removes Users and Clients.
--
-- Decided directly (20 Nov 2026): an Admin no longer needs an Owner to
-- switch on "Can invite people" (phase44): every active Admin can invite,
-- and adds, edits and removes the people below them, Users and Clients,
-- as an Owner does. Only an Owner invites an Admin or an Owner (the invite
-- route holds that line; an Admin giving a role is already held below
-- their own by change_member_type and the memberships policies).
-- memberships.can_invite stays, unread, so nothing that selects it breaks.

create or replace function can_invite_people(check_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select is_agency_owner_or_above(check_agency_id) or exists (
    select 1 from memberships
    where agency_id = check_agency_id
      and user_id = auth.uid()
      and role = 'admin'
      and client_id is null
      and removed_at is null
      and accepted_at is not null
      and in_request_agency(check_agency_id)
  );
$$;
