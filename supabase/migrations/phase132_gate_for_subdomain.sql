-- The request gate (proxy.ts) asked two questions of every request on an
-- agency's address, one after the other: is there a workspace here
-- (workspace_for_subdomain), and does the person signed in belong to it
-- (current_agency_ids). One call now answers both, so each page, each
-- navigation and each of the app's own requests waits on one round trip
-- to the database instead of two (speed pass, 2 Nov 2026).
--
-- The same checks, unchanged: the workspace by its address, not archived;
-- membership is current_agency_ids() as before, which is already narrowed
-- to this address's agency by the request's x-frank-agency header
-- (phase36) and empty for a suspended agency (phase37). Someone signed out
-- gets is_member false. The old two functions stay: the proxy falls back
-- to them where this one isn't there yet.

create or replace function gate_for_subdomain(p_subdomain text)
returns table (name text, suspended boolean, is_member boolean)
language sql security definer stable set search_path = public, extensions as $$
  select a.name, a.suspended_at is not null, exists (select 1 from current_agency_ids())
  from agencies a
  where a.subdomain = p_subdomain::citext and a.archived_at is null;
$$;

grant execute on function gate_for_subdomain(text) to anon, authenticated;
