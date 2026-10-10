-- Phase 82 — working on the same post at once.
--
-- Decided directly (9 Oct 2026): a save must never silently undo someone
-- else's. Each post now records when it last changed and who changed it;
-- the app opens a post's brief with that time and saves only if it still
-- matches, otherwise it says who changed it and lets you choose. And
-- posts' changes reach every open project table and post page live, as
-- comments do (phase65): Realtime nudges the page, which reloads through
-- the usual rules.

alter table creatives
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references users (id);

-- Every change stamps the time, and the person when there is one (a
-- review link's guest or the daily run leaves the last person as it was).
create or replace function creatives_stamp_update()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;
drop trigger if exists creatives_stamp_update on creatives;
create trigger creatives_stamp_update
  before update on creatives
  for each row execute function creatives_stamp_update();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'creatives'
  ) then
    alter publication supabase_realtime add table public.creatives;
  end if;
end;
$$;
