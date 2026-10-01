-- Phase 24 — team invites, and member management narrowed to Owner tier.
--
-- 1. Per direct instruction, only an Owner or the Primary Owner decides
--    who gets in and at what role — Admin no longer can. That covers
--    memberships (insert/update/delete) and staff_client_access
--    (grant/revoke), which phase23b/23c left Admin-tier. Admin keeps its
--    other powers (agency settings etc.) through is_agency_admin(), which
--    is unchanged. The Primary Owner's own row stays off limits to
--    everyone but transfer_primary_ownership(), same as phase23c.
--
-- 2. invites — one row per emailed invite link. Only a sha256 hash of
--    the token is stored; the raw token exists only in the email. The
--    inviter's own session inserts it (so RLS, not the route, decides
--    who may invite). Nothing grants anon anything here: the public
--    accept page goes through a server route that looks the hash up with
--    the service-role client, the same shape as /api/shared-review.

drop policy memberships_insert on memberships;
create policy memberships_insert on memberships
  for insert with check (
    is_agency_owner_or_above(agency_id)
    and role <> 'primary_owner'
  );
drop policy memberships_update on memberships;
create policy memberships_update on memberships
  for update
  using (
    current_setting('frank.ownership_transfer_in_progress', true) = 'true'
    or (is_agency_owner_or_above(agency_id) and role <> 'primary_owner')
  )
  with check (
    current_setting('frank.ownership_transfer_in_progress', true) = 'true'
    or (is_agency_owner_or_above(agency_id) and role <> 'primary_owner')
  );
drop policy memberships_delete on memberships;
create policy memberships_delete on memberships
  for delete using (
    is_agency_owner_or_above(agency_id)
    and role <> 'primary_owner'
  );

drop policy staff_client_access_insert on staff_client_access;
create policy staff_client_access_insert on staff_client_access
  for insert with check (is_agency_owner_or_above(agency_id));
drop policy staff_client_access_delete on staff_client_access;
create policy staff_client_access_delete on staff_client_access
  for delete using (is_agency_owner_or_above(agency_id));

create table invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id), -- denormalised from membership, for RLS
  membership_id uuid not null references memberships (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create index invites_membership_idx on invites (membership_id);

create trigger invites_set_agency_id
  before insert or update of membership_id on invites
  for each row execute function set_agency_id_from_membership();

alter table invites enable row level security;

create policy invites_select on invites
  for select using (is_agency_owner_or_above(agency_id));
create policy invites_insert on invites
  for insert with check (
    is_agency_owner_or_above(agency_id)
    and created_by = auth.uid()
  );
-- Re-sending an invite replaces the old link rather than leaving two live.
create policy invites_delete on invites
  for delete using (is_agency_owner_or_above(agency_id) and accepted_at is null);
