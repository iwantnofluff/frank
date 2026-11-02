-- Phase 129 — a workspace's Owners and Admins can change its name, address
-- and AI model, and nothing else on agencies.
--
-- Found 2 Nov 2026, checking the admin area: agencies_update (phase0) lets
-- an Owner or Admin update their own agency row, every column. Signed in as
-- Northlight's Owner, in a rolled-back transaction on staging, a plain
-- update set its plan to Enterprise, added 50,000 AI requests a month,
-- moved its trial end five years out and cleared a pause. The app never
-- offers any of that, but the API answered it: anyone with a session could
-- skip paying.
--
-- The plan, trial, pause, archive and the admin's extras are set by Frank
-- alone: Paddle's webhook, sign-up, the admin area and clean-up, all with
-- the service role, which this leaves alone (acting_as_person(), phase41).
-- The limit columns follow from the plan and extras (apply_plan_limits,
-- phase42), so they're covered by those.

create or replace function guard_agency_platform_columns()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if not acting_as_person() then return new; end if;
  if (new.id, new.plan, new.plan_renews_at, new.trial_ends_at, new.suspended_at, new.archived_at,
      new.storage_bytes_used, new.created_at,
      new.extra_seats, new.extra_clients, new.extra_ai_requests, new.extra_storage_bytes)
     is distinct from
     (old.id, old.plan, old.plan_renews_at, old.trial_ends_at, old.suspended_at, old.archived_at,
      old.storage_bytes_used, old.created_at,
      old.extra_seats, old.extra_clients, old.extra_ai_requests, old.extra_storage_bytes) then
    raise exception 'Only Frank can change a workspace''s plan, trial, limits or status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_agency_platform_columns before update on agencies
  for each row execute function guard_agency_platform_columns();
