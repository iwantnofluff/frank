-- Phase 128 — an AI allowance per plan, the newer Claude models, and the
-- tokens each request used.
--
-- Decided directly (2 Nov 2026), ahead of launch: Frank pays every
-- agency's AI bill from one key, so each plan's allowance is set so its
-- worst case stays well under what the plan pays. Free (the trial) gets a
-- taste, not the 300 every plan had (phase12, phase42).

-- 1. Allowances: Free 30, Starter 150, Growth 400, Agency 1,000,
-- Enterprise 1,000 (custom deals add an extra in the admin area). The
-- other limits are unchanged from phase42. lib/plans.ts keeps the same
-- table for the app.
create or replace function plan_limits(p_plan plan_tier)
returns table (clients int, seats int, storage_bytes bigint, ai_requests int)
language sql immutable set search_path = public, extensions as $$
  select t.clients, t.seats, t.storage_bytes, t.ai_requests from (values
    ('free'::plan_tier, 1, 2, 524288000::bigint, 30),
    ('starter', 3, 5, 5368709120, 150),
    ('growth', 10, 15, 26843545600, 400),
    ('agency', 25, null, 80530636800, 1000),
    ('enterprise', null, null, null, 1000)
  ) as t (plan, clients, seats, storage_bytes, ai_requests)
  where t.plan = p_plan;
$$;

-- 2. The newer Claude models (cheaper, and Haiku 5.5 about a tenth of
-- Haiku 4.5): every agency on an older one moves to its successor, and new
-- agencies start on Opus 5.5. The app still answers the old names, so the
-- order of deploy and migration doesn't matter.
alter table agencies alter column ai_default_model set default 'claude-opus-5-5';
update agencies set ai_default_model = case ai_default_model
    when 'claude-opus-5' then 'claude-opus-5-5'
    when 'claude-sonnet-5' then 'claude-sonnet-5-5'
    when 'claude-haiku-4-5-20251001' then 'claude-haiku-5-5'
  end
  where ai_default_model in ('claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001');

-- Recompute every agency's limits through phase42's trigger, which runs on
-- any update; an agency whose model just changed already went through it.
update agencies set extra_clients = extra_clients;

-- 3. What each request used, so what an agency costs Frank is known
-- rather than estimated. Counts only, never the content. Null on requests
-- from before this, or where a provider doesn't say.
alter table ai_usage_events
  add column input_tokens int check (input_tokens >= 0),
  add column cache_read_tokens int check (cache_read_tokens >= 0),
  add column output_tokens int check (output_tokens >= 0);
