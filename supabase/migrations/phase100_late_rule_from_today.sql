-- Phase 100 — the late rule from today.
--
-- Decided directly (14 Oct 2026): a post counts as late only if it was
-- planned from today on. Any post planned before today is taken to have
-- gone live on its planned day: when it reaches Live (set by hand or found
-- on Instagram), that day is its live date. And every Approved post
-- planned before today moves to 5. Live now, as it has presumably gone out.
--
-- Today starts at midnight in India (+05:30), the agency's day.

create or replace function late_rule_from()
returns timestamptz
language sql immutable as $$ select '2026-10-14 00:00:00+05:30'::timestamptz $$;

-- A live date for a post planned before today is its planned day, however
-- it was found or set.
create or replace function post_live_dates_before_rule()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.scheduled_at is not null and new.scheduled_at < late_rule_from() then
    new.live_at := new.scheduled_at;
  end if;
  return new;
end;
$$;
drop trigger if exists post_live_dates_before_rule on post_live_dates;
create trigger post_live_dates_before_rule
  before insert or update on post_live_dates
  for each row execute function post_live_dates_before_rule();

-- Live by hand (phase99's): its planned day is a continuous project's Live
-- Date when it has no Publish Date, so the rule above sees it too.
create or replace function creatives_live_date()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage = 5 and old.stage is distinct from 5 then
    insert into post_live_dates (creative_id, agency_id, live_at, scheduled_at, source)
    values (new.id, new.agency_id, now(), coalesce(new.scheduled_at, new.due_on::timestamptz), 'manual')
    on conflict (creative_id) do nothing;
  elsif old.stage = 5 and new.stage is distinct from 5 then
    delete from post_live_dates where creative_id = new.id and source = 'manual';
  end if;
  return new;
end;
$$;

-- The live dates already logged for posts planned before today.
update post_live_dates set live_at = scheduled_at
where scheduled_at is not null and scheduled_at < late_rule_from() and live_at is distinct from scheduled_at;

-- Every Approved post planned before today, not archived: 5. Live, its
-- live date its planned day (the trigger above).
update creatives set stage = 5
where stage = 4
  and archived_at is null
  and coalesce(scheduled_at, due_on::timestamptz) < late_rule_from();
