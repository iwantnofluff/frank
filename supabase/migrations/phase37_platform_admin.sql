-- Phase 37 — the platform admin area (admin.beingfrank.app), agency
-- limits that are actually enforced, and suspending an agency.
--
-- Decided directly: the admin area is used with its own admin-only
-- account (no agency membership), and its first version lists every
-- agency with its usage, changes an agency's limits, suspends or
-- reactivates it, and creates new agencies.

-- 1. Who is a platform admin. Nobody can read or write this through the
--    API (row level security on, no policies): only the server, with the
--    service role, checks it — /api/admin/* does on every request.
create table platform_admins (
  user_id uuid primary key references users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

-- 2. Limits. seat_limit (phase0) and the "of 10 clients" in New Client were
--    never enforced; only the AI cap was. client_limit is new (10, what the
--    app already said), and both are now checked by the database.
alter table agencies add column client_limit int not null default 10;
alter table agencies add constraint agencies_limits_nonnegative
  check (seat_limit >= 0 and client_limit >= 0 and ai_monthly_request_cap >= 0);

-- Active clients (not archived) up to client_limit. Counted as the
-- database, not the caller — a User sees only their own clients, and the
-- limit is the agency's.
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
  select count(*) into v_count from clients
  where agency_id = new.agency_id and archived_at is null and id <> new.id;
  if v_count >= v_limit then
    raise exception 'client limit reached (%)', v_limit;
  end if;
  return new;
end;
$$;

create trigger clients_zz_enforce_limit
  before insert or update of archived_at, agency_id on clients
  for each row execute function enforce_client_limit();

-- Team members (staff, not client members) up to seat_limit — a pending
-- invite holds a seat, a removed member doesn't.
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
  select count(*) into v_count from memberships
  where agency_id = new.agency_id and client_id is null and removed_at is null and id <> new.id;
  if v_count >= v_limit then
    raise exception 'member limit reached (%)', v_limit;
  end if;
  return new;
end;
$$;

create trigger memberships_zz_enforce_seat_limit
  before insert or update of removed_at, client_id on memberships
  for each row execute function enforce_seat_limit();

-- 3. Suspending. A suspended agency keeps everything, but nobody in it can
--    see or change anything: in_request_agency (phase36), which every
--    access helper calls, now also leaves out a suspended agency — on its
--    own address, the old vercel.app address and anywhere else alike.
alter table agencies add column suspended_at timestamptz;

create or replace function in_request_agency(check_agency_id uuid)
returns boolean
language sql security definer stable set search_path = public, extensions as $$
  select
    not exists (select 1 from agencies s where s.id = check_agency_id and s.suspended_at is not null)
    and case
      when coalesce(current_setting('request.headers', true), '') = '' then true
      when coalesce(current_setting('request.headers', true)::json ->> 'x-frank-agency', '') = '' then true
      else exists (
        select 1 from agencies a
        where a.id = check_agency_id
          and a.subdomain = (current_setting('request.headers', true)::json ->> 'x-frank-agency')::citext
      )
    end;
$$;

-- The address says it's paused, rather than "no workspace".
drop function workspace_for_subdomain(text);
create function workspace_for_subdomain(p_subdomain text)
returns table (name text, suspended boolean)
language sql security definer stable set search_path = public, extensions as $$
  select a.name, a.suspended_at is not null from agencies a
  where a.subdomain = p_subdomain::citext and a.archived_at is null;
$$;
grant execute on function workspace_for_subdomain(text) to anon, authenticated;
