-- Phase 65 — comments and Draft with Frank conversations appear live.
--
-- Direct instruction: a comment made on one device shows on every other
-- page that's open on the post, without a refresh. Supabase Realtime sends
-- a page a nudge when one of these tables changes; the page then reloads
-- them through the usual rules (RLS), so nothing is shown that the person
-- couldn't already read, and Realtime itself only delivers a change to
-- someone whose select policy lets them see that row.
--
-- Safe to run where they're already added.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['comments', 'copy_chats', 'copy_chat_messages'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
