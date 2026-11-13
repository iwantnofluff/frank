-- Phase 153 — notifications reach an open Frank as they're made.
--
-- Decided directly (13 Nov 2026): someone mentioned in a comment gets a
-- pop-up, the moment it happens if Frank is open, and the bell updates at
-- once rather than on its minute's check. Realtime only delivers a row to
-- someone its select policy lets see it (notifications_select, phase136:
-- your own), so nobody hears anyone else's. Safe to run where it's already
-- added.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
