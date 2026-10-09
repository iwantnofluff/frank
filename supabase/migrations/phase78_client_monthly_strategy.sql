-- Phase 78 — a client's monthly strategy.
--
-- Decided directly (9 Oct 2026): what's been decided for a client for a
-- month, kept in its Client Settings under Knowledge → Strategy, one month
-- to a row, in named fields (decided directly): Objective, Key messages,
-- Themes and campaigns, Offers and promotions, Key dates, Notes. Draft with
-- Frank reads the month a post goes live in (no live date: this month);
-- an empty field, or a month with none, is simply left out. A client's
-- page shows this month's.
--
-- Who reads and writes it is Knowledge's own (knowledge_entries): anyone
-- who can see the client reads it, the client's own people included; only
-- the team writes it. agency_id comes from the client, as Knowledge's
-- does. It goes with the client.

create table client_monthly_strategies (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  client_id uuid not null references clients (id) on delete cascade,
  -- The month, as its first day.
  month date not null check (extract(day from month) = 1),
  objective text,
  key_messages text,
  themes text,
  offers text,
  key_dates text,
  notes text,
  updated_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);

create trigger client_monthly_strategies_set_agency_id
  before insert or update of client_id on client_monthly_strategies
  for each row execute function set_agency_id_from_client();
create trigger zz_read_only_guard before insert or update or delete on client_monthly_strategies
  for each row execute function block_writes_when_read_only();

alter table client_monthly_strategies enable row level security;

create policy client_monthly_strategies_select on client_monthly_strategies
  for select using (
    agency_id in (select current_agency_ids())
    and client_id in (select visible_client_ids(agency_id))
  );
create policy client_monthly_strategies_insert on client_monthly_strategies
  for insert with check (client_id in (select staff_visible_client_ids(agency_id)));
create policy client_monthly_strategies_update on client_monthly_strategies
  for update using (client_id in (select staff_visible_client_ids(agency_id)));
create policy client_monthly_strategies_delete on client_monthly_strategies
  for delete using (client_id in (select staff_visible_client_ids(agency_id)));
