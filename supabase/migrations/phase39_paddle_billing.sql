-- Phase 39 — paying through Paddle.
--
-- Decided directly: payments go through Paddle. Upgrades charge the
-- prorated difference straight away; downgrades and cancelling take effect
-- at the end of the paid period, and a cancelled plan drops to Free.
-- Agencies on Free, or already paying through Paddle, pay by card; ones
-- Frank put on a paid plan by hand keep asking Frank (plan_requests).
--
-- agencies.plan (and its limits) stays what an agency can use. This is
-- Paddle's side of it, written only by the webhook and the billing routes
-- (service role); an agency's Admins and Owners can read their own.

create table agency_billing (
  agency_id uuid primary key references agencies (id) on delete cascade,
  paddle_customer_id text,
  paddle_subscription_id text unique,
  -- Paddle's subscription status: active, trialing, past_due, paused, canceled.
  status text,
  billing_interval text check (billing_interval in ('monthly', 'annual')),
  -- The period paid for. A downgrade made during it waits for its end.
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  -- A cheaper plan starting when this period ends.
  scheduled_plan plan_tier,
  -- Cancelling: the plan ends here and the agency moves to Free.
  cancel_at timestamptz,
  -- The newest Paddle event applied, so a late, older one can't undo it.
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table agency_billing enable row level security;

create policy agency_billing_select on agency_billing
  for select using (is_agency_admin(agency_id));

-- Every Paddle notification handled, so a retried one is only applied once.
-- Service role only: no policies.
create table paddle_events (
  event_id text primary key,
  event_type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
alter table paddle_events enable row level security;
