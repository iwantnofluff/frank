-- Phase 42 — an agency's limits come from its plan, plus whatever the
-- platform admin adds on top.
--
-- Decided directly (3 Oct 2026): the limits are the plan's, shown fixed;
-- the admin area has a separate override box for extra team members,
-- clients, AI requests and storage. Until now the admin edited the limits
-- themselves, and a plan change overwrote them.
--
-- The database works the limits out (whenever the plan or an extra
-- changes), so whoever changes the plan — Paddle's webhook, the admin
-- applying a request, a new sign-up — only sets the plan, and the extras
-- survive it. The spec gives no AI allowance per plan, so every plan keeps
-- the 300 a month it had (phase12).

alter table agencies
  add column extra_seats int not null default 0 check (extra_seats >= 0),
  add column extra_clients int not null default 0 check (extra_clients >= 0),
  add column extra_ai_requests int not null default 0 check (extra_ai_requests >= 0),
  add column extra_storage_bytes bigint not null default 0 check (extra_storage_bytes >= 0);

-- Each plan's own limits (lib/plans.ts keeps the same table for the app).
-- null is unlimited.
create or replace function plan_limits(p_plan plan_tier)
returns table (clients int, seats int, storage_bytes bigint, ai_requests int)
language sql immutable set search_path = public, extensions as $$
  select t.clients, t.seats, t.storage_bytes, t.ai_requests from (values
    ('free'::plan_tier, 1, 2, 524288000::bigint, 300),
    ('starter', 3, 5, 5368709120, 300),
    ('growth', 10, 15, 26843545600, 300),
    ('agency', 25, null, 80530636800, 300),
    ('enterprise', null, null, null, 300)
  ) as t (plan, clients, seats, storage_bytes, ai_requests)
  where t.plan = p_plan;
$$;

-- The limits every check reads (phase37, phase41): the plan's, plus the
-- extras. Unlimited stays unlimited.
create or replace function apply_plan_limits()
returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  l record;
begin
  select * into l from plan_limits(new.plan);
  new.client_limit := l.clients + new.extra_clients;
  new.seat_limit := l.seats + new.extra_seats;
  new.storage_limit_bytes := l.storage_bytes + new.extra_storage_bytes;
  new.ai_monthly_request_cap := l.ai_requests + new.extra_ai_requests;
  return new;
end;
$$;

-- Keep what each agency has today: anything above its plan becomes an
-- extra (the test fixtures' roomy limits, say), so nothing shrinks.
update agencies a set
  extra_clients = greatest(coalesce(a.client_limit - (select clients from plan_limits(a.plan)), 0), 0),
  extra_seats = greatest(coalesce(a.seat_limit - (select seats from plan_limits(a.plan)), 0), 0),
  extra_storage_bytes = greatest(coalesce(a.storage_limit_bytes - (select storage_bytes from plan_limits(a.plan)), 0), 0),
  extra_ai_requests = greatest(a.ai_monthly_request_cap - (select ai_requests from plan_limits(a.plan)), 0);

create trigger apply_plan_limits before insert or update on agencies
  for each row execute function apply_plan_limits();

-- Recompute everyone once, through the trigger.
update agencies set extra_clients = extra_clients;
