-- Phase 159 — Check VO and Text on Image, logged as its own AI task.
--
-- Decided directly (14 Nov 2026): the Checks tab gains Check VO and Text on
-- Image, comparing the two for mismatches in wording and in meaning. It
-- runs through runAiTask like the other checks, counted towards the
-- workspace's monthly limit, and logged as 'check_vo'.

alter table ai_usage_events drop constraint if exists ai_usage_events_task_check;
alter table ai_usage_events add constraint ai_usage_events_task_check check (task = any (array[
  'copy_chat', 'design_direction', 'proofread', 'check', 'check_creative', 'check_design',
  'wiifm_note', 'voice_post', 'strategy_overview', 'classify_comment', 'ask_frank', 'check_vo'
]));

notify pgrst, 'reload schema';
