-- Phase 71 — what Analytics needs that Frank didn't keep.
--
-- Decided directly (8 Oct 2026): an Analytics page in Settings, for Owners
-- and Admins, on how long posts take from concept to approval and what
-- holds them up. Two things weren't recorded:
--
-- 1. When a post moved between stages. creatives only holds its current
--    stage, so time in Concept, Internal Review or Client Review couldn't be
--    worked out (docs/parity-gaps.md, "Comment intelligence, Phase 1": "no
--    stage_history audit table today"). Chosen: log every move from now on.
--    For posts that already exist, the two moments Frank does know are
--    filled in: created (at Concept) and, if approved, approved.
--
-- 2. A comment's mood. Chosen: positive, neutral or negative, for each new
--    comment. It comes from the same AI call that already sorts each comment
--    by issue type (phase20), so it costs no extra call.

-- 1. The stage log ------------------------------------------------------------

create table creative_stage_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_id uuid not null references creatives (id) on delete cascade,
  -- null for the first event (the post being created).
  from_stage int,
  to_stage int not null,
  -- Changes Requested or Rejected, when that's what this move set.
  exception creative_exception,
  at timestamptz not null default now(),
  -- Who moved it, when it was someone signed in (null for a guest on a
  -- review link, or the system).
  by_user uuid references users (id) on delete set null
);

create index creative_stage_events_creative_at_idx on creative_stage_events (creative_id, at);
create index creative_stage_events_agency_at_idx on creative_stage_events (agency_id, at);

alter table creative_stage_events enable row level security;

-- Read by the agency's Owners and Admins (Analytics); written only by the
-- trigger below, never by anyone directly.
create policy creative_stage_events_select on creative_stage_events
  for select using (is_agency_admin(agency_id));

create or replace function log_creative_stage_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into creative_stage_events (agency_id, creative_id, from_stage, to_stage, exception, at, by_user)
    values (new.agency_id, new.id, null, new.stage, new.exception, new.created_at, auth.uid());
  elsif new.stage is distinct from old.stage or new.exception is distinct from old.exception then
    insert into creative_stage_events (agency_id, creative_id, from_stage, to_stage, exception, by_user)
    values (new.agency_id, new.id, old.stage, new.stage, new.exception, auth.uid());
  end if;
  return new;
end;
$$;

create trigger creatives_log_stage
  after insert or update of stage, exception on creatives
  for each row execute function log_creative_stage_event();

-- What's known for posts that already exist: created, and approved.
insert into creative_stage_events (agency_id, creative_id, from_stage, to_stage, at)
select c.agency_id, c.id, null, 1, c.created_at from creatives c;

insert into creative_stage_events (agency_id, creative_id, from_stage, to_stage, at)
select c.agency_id, c.id, null, 4, c.approved_at from creatives c
where c.stage = 4 and c.approved_at is not null;

-- 2. A comment's mood ---------------------------------------------------------

alter table comments add column sentiment text
  check (sentiment is null or sentiment in ('positive', 'neutral', 'negative'));
