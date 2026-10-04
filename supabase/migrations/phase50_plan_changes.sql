-- Phase 50 — a record of every plan change, for the admin overview.
--
-- Decided directly (4 Oct 2026): the platform admin's overview shows this
-- month's upgrades and downgrades. Nothing kept that history: an agency's
-- plan was simply overwritten. From now on each change is recorded here,
-- whoever makes it (Paddle's webhook, the agency's Owner, a hand-set plan).
-- History starts when this runs.

create table plan_changes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id) on delete cascade,
  from_plan plan_tier not null,
  to_plan plan_tier not null,
  changed_at timestamptz not null default now()
);
create index plan_changes_changed_at_idx on plan_changes (changed_at);

-- Only the service role reads it (the admin API); nobody writes it but the
-- trigger.
alter table plan_changes enable row level security;

create or replace function record_plan_change()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.plan is distinct from old.plan then
    insert into plan_changes (agency_id, from_plan, to_plan) values (new.id, old.plan, new.plan);
  end if;
  return new;
end;
$$;

create trigger record_plan_change
  after update of plan on agencies
  for each row execute function record_plan_change();
