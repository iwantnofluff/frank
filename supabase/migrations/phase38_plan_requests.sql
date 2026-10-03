-- Phase 38 — Your Plan (Settings), before payments are connected.
--
-- The tiers and their limits are the spec's (v11 §5: Free, Starter,
-- Growth, Agency, Enterprise). Decided directly: payments will go through
-- Paddle; until that's connected, choosing another plan in Settings sends
-- Frank a request, which the platform admin applies from the admin area.

-- 1. Unlimited. Agency and Enterprise have unlimited seats, Enterprise
--    unlimited clients — a null limit now means no limit, and the limit
--    checks (phase37) skip it.
alter table agencies alter column seat_limit drop not null;
alter table agencies alter column client_limit drop not null;

create or replace function enforce_client_limit()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_limit int;
  v_count int;
begin
  if new.archived_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.archived_at is null and old.agency_id = new.agency_id then return new; end if;
  select client_limit into v_limit from agencies where id = new.agency_id;
  if v_limit is null then return new; end if;
  select count(*) into v_count from clients
  where agency_id = new.agency_id and archived_at is null and id <> new.id;
  if v_count >= v_limit then
    raise exception 'client limit reached (%)', v_limit;
  end if;
  return new;
end;
$$;

create or replace function enforce_seat_limit()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_limit int;
  v_count int;
begin
  if new.client_id is not null or new.removed_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.client_id is null and old.removed_at is null then return new; end if;
  select seat_limit into v_limit from agencies where id = new.agency_id;
  if v_limit is null then return new; end if;
  select count(*) into v_count from memberships
  where agency_id = new.agency_id and client_id is null and removed_at is null and id <> new.id;
  if v_count >= v_limit then
    raise exception 'member limit reached (%)', v_limit;
  end if;
  return new;
end;
$$;

-- No Fluff is on Agency: 25 clients, unlimited seats (the spec's tier).
update agencies set client_limit = 25, seat_limit = null
where id = '8cb48f60-eb9c-4f39-b73f-dfbf7bc4aca6' and plan = 'agency';

-- 2. A request to change plan. Made by the agency's Admins and Owners
--    (the spec: billing is managed by the agency Admin), read by them and
--    by the platform admin (service role). Applied — or declined — from the
--    admin area, which stamps handled_at.
create table plan_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id) on delete cascade,
  requested_plan plan_tier not null,
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annual')),
  requested_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  outcome text check (outcome in ('applied', 'declined'))
);
alter table plan_requests enable row level security;

create policy plan_requests_select on plan_requests
  for select using (is_agency_admin(agency_id));
create policy plan_requests_insert on plan_requests
  for insert with check (is_agency_admin(agency_id) and requested_by = auth.uid() and handled_at is null);
