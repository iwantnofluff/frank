-- Phase 130 — for the admin area (decided directly, 2 Nov 2026):
-- workspaces marked internal, and which feature each AI request was for.

-- 1. Internal: Frank's own and test workspaces (Frank Review, test
-- sign-ups), left out of the admin's revenue, counts and "needs a look".
-- Set in the admin area only: the guard (phase129) now covers it too.
alter table agencies add column is_internal boolean not null default false;

create or replace function guard_agency_platform_columns()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if not acting_as_person() then return new; end if;
  if (new.id, new.plan, new.plan_renews_at, new.trial_ends_at, new.suspended_at, new.archived_at,
      new.storage_bytes_used, new.created_at, new.is_internal,
      new.extra_seats, new.extra_clients, new.extra_ai_requests, new.extra_storage_bytes)
     is distinct from
     (old.id, old.plan, old.plan_renews_at, old.trial_ends_at, old.suspended_at, old.archived_at,
      old.storage_bytes_used, old.created_at, old.is_internal,
      old.extra_seats, old.extra_clients, old.extra_ai_requests, old.extra_storage_bytes) then
    raise exception 'Only Frank can change a workspace''s plan, trial, limits or status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 2. Which feature an AI request was for (runAiTask's callers), so the
-- admin can see what costs what. Null on requests from before this.
alter table ai_usage_events add column task text check (task in (
  'copy_chat',          -- Draft with Frank
  'design_direction',   -- Design with Frank
  'proofread',
  'check',              -- Check WIIFM / Check Brand
  'check_creative',
  'check_design',
  'wiifm_note',
  'voice_post',         -- Speak It
  'strategy_overview',
  'classify_comment'    -- sorting a client's comment, automatically
));
