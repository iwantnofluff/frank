-- Phase 23d — New Client broke under phase23b's clients_select.
--
-- useCreateClient inserts and reads the row back (insert ... select). The
-- read-back is checked against clients_select, which asked
-- visible_client_ids() — a stable function that looks the id up in
-- clients itself, under the statement's starting snapshot, where the row
-- being inserted doesn't exist yet. So every new client failed with "new
-- row violates row-level security policy" even for an Admin.
--
-- Unrestricted staff (the only callers clients_insert allows) now pass
-- without the lookup; restricted Users and client-side members still go
-- through visible_client_ids, as before.

drop policy clients_select on clients;
create policy clients_select on clients
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_unrestricted_staff(agency_id)
      or id in (select visible_client_ids(agency_id))
    )
  );
