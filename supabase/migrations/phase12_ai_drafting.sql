-- ai_usage_events -------------------------------------------------------
-- One row per AI call, staff-only, same RLS shape as
-- agency_knowledge_entries. Backs the per-agency monthly request cap
-- (COUNT(*) of this agency's rows since the start of the current month)
-- and doubles as an audit trail of who used which model when — there's
-- no separate "usage counter" column anywhere to keep in sync, the count
-- is always derived from real rows. Stores the exact model id (not just
-- the vendor) since one agency setting can name any model in the catalog
-- (lib/ai/models.ts), and the model implies its own provider.

create table ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  user_id uuid not null references users (id),
  model text not null, -- e.g. 'claude-opus-5', 'gpt-4.1', 'gemini-2.5-flash'
  created_at timestamptz not null default now()
);

create index ai_usage_events_agency_created_idx on ai_usage_events (agency_id, created_at);

alter table ai_usage_events enable row level security;

create policy ai_usage_events_select on ai_usage_events
  for select using (is_agency_staff(agency_id));
create policy ai_usage_events_insert on ai_usage_events
  for insert with check (is_agency_staff(agency_id));

-- agencies: per-agency monthly cap and drafting model. Platform-pays model
-- (the agency never supplies its own provider key), so the cap is what
-- stops one agency's drafting volume from consuming an unbounded share of
-- the platform's own bill — not a per-agency billing limit, a safety
-- ceiling. ai_default_model is admin-only to change (agencies_update's
-- existing is_agency_admin() gate, phase0_baseline.sql) — same reasoning
-- as the cap: a cost-affecting setting, not a day-to-day staff one.
alter table agencies add column ai_monthly_request_cap int not null default 300;
alter table agencies add column ai_default_model text not null default 'claude-opus-5';
