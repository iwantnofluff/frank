-- Phase 147 — Ask Frank: questions about Frank, answered by AI.
--
-- Decided directly (10 Nov 2026): Help is now Ask Frank, with a chat box,
-- "Ask Frank anything", answered from Help's own articles. Anyone signed
-- in can ask. Its requests are logged like every other AI request, as
-- task 'ask_frank', but don't count towards the workspace's monthly AI
-- limit (run-ai-task.ts leaves them out of the count, and Credit Usage out
-- of its list).

alter table ai_usage_events drop constraint if exists ai_usage_events_task_check;
alter table ai_usage_events add constraint ai_usage_events_task_check check (task = any (array[
  'copy_chat', 'design_direction', 'proofread', 'check', 'check_creative', 'check_design',
  'wiifm_note', 'voice_post', 'strategy_overview', 'classify_comment', 'ask_frank'
]));

notify pgrst, 'reload schema';
