-- Phase 64 — agency settings writable by Admins, Owners and the Primary
-- Owner, on live as on staging.
--
-- Reported directly: on live, the Primary Owner couldn't save the agency's
-- logo ("new row violates row-level security policy for table
-- agency_settings"). Live's insert and update policies were an early
-- version made before migrations were kept (phase0's note: phases 1–5 were
-- applied to live directly), checking role = 'admin' only. Staging has
-- phase7's versions, which ask is_agency_admin() — Admins, Owners and the
-- Primary Owner, accepted, active, in the agency being visited. These put
-- phase7's back, the same everywhere. Safe to run where they're already
-- right.

drop policy if exists agency_settings_insert on agency_settings;
create policy agency_settings_insert on agency_settings
  for insert with check (is_agency_admin(agency_id));

drop policy if exists agency_settings_update on agency_settings;
create policy agency_settings_update on agency_settings
  for update using (is_agency_admin(agency_id));
