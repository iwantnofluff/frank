-- Phase 83 — a written overview in each Strategy box on a client's page.
--
-- Decided directly (10 Oct 2026): each box on a client's page (Tone of
-- Voice, Target Audience, Prioritised Features, this month's strategy)
-- shows a short overview Frank writes from everything in it, as a
-- snapshot, in place of its first entry cut short. Rewritten when what
-- it's written from changes (decided directly), the first time someone on
-- the team opens the client after that: one AI call per change, counted
-- against the workspace's monthly limit like every other; the page itself
-- costs nothing to show.
--
-- One row per box: `section` is the Knowledge section (tone, audience,
-- features) or the month (month:YYYY-MM-01); `source_hash` is what it was
-- written from (lib/strategy-overview.ts), so a change is seen. Who reads
-- and writes it is the strategy's own (phase78): anyone who can see the
-- client reads it, the client's own people included; only the team
-- writes it. It goes with the client.

create table client_strategy_overviews (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  client_id uuid not null references clients (id) on delete cascade,
  section text not null check (section in ('tone', 'audience', 'features') or section ~ '^month:\d{4}-\d{2}-01$'),
  overview text not null,
  source_hash text not null,
  updated_at timestamptz not null default now(),
  unique (client_id, section)
);

create trigger client_strategy_overviews_set_agency_id
  before insert or update of client_id on client_strategy_overviews
  for each row execute function set_agency_id_from_client();
create trigger zz_read_only_guard before insert or update or delete on client_strategy_overviews
  for each row execute function block_writes_when_read_only();

alter table client_strategy_overviews enable row level security;

create policy client_strategy_overviews_select on client_strategy_overviews
  for select using (
    agency_id in (select current_agency_ids())
    and client_id in (select visible_client_ids(agency_id))
  );
create policy client_strategy_overviews_insert on client_strategy_overviews
  for insert with check (client_id in (select staff_visible_client_ids(agency_id)));
create policy client_strategy_overviews_update on client_strategy_overviews
  for update using (client_id in (select staff_visible_client_ids(agency_id)));
create policy client_strategy_overviews_delete on client_strategy_overviews
  for delete using (client_id in (select staff_visible_client_ids(agency_id)));

notify pgrst, 'reload schema';
