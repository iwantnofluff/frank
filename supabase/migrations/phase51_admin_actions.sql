-- Phase 51 — a log of what the platform admin does inside an agency.
--
-- Decided directly (4 Oct 2026): the admin area can act for an agency
-- (resend an invite, send a password reset, change someone's role, extend
-- a trial, pause or unpause it), always with a reason, and every action is
-- recorded here. The agency's Owners can read their own agency's entries,
-- so acting inside their account is never invisible to them. Only the
-- admin API (service role) writes.

create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id) on delete cascade,
  -- Kept as text as well as the id: the admin's account may go later.
  actor_id uuid references users (id) on delete set null,
  actor_name text not null,
  action text not null,
  -- Who or what it was done to, as it read at the time.
  target text,
  detail text,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index admin_actions_agency_idx on admin_actions (agency_id, created_at desc);

alter table admin_actions enable row level security;
create policy admin_actions_select on admin_actions
  for select using (is_agency_owner_or_above(agency_id));
