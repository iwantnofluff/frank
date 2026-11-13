-- Phase 156 — a project's Slack updates in one thread.
--
-- Decided directly (13 Nov 2026): every update for a project (its client's
-- activity, its team's comments) goes into one thread in the project's own
-- channel, so they're all together. The first update posts the thread's
-- header message; this remembers it. A new channel starts a new thread, as
-- does Start a New Thread in its Settings (thread_ts set back to null).
--
-- A Slack List per project (phase155) is set aside: Slack lets no app post
-- into an item's thread, nor be shared an existing List, so it can't keep a
-- project's comments together. Its table stays, unused, until it's removed.

alter table project_slack add column if not exists thread_ts text;

-- A different channel: the old thread is no use there.
create or replace function project_slack_new_channel_new_thread()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.channel_id is distinct from old.channel_id then
    new.thread_ts := null;
  end if;
  return new;
end;
$$;

create trigger project_slack_new_channel_new_thread
  before update of channel_id on project_slack
  for each row execute function project_slack_new_channel_new_thread();

notify pgrst, 'reload schema';
