-- Phase 162 — a comment can be kept out of Slack.
--
-- Decided directly (16 Nov 2026): when a project has a Slack channel, the
-- team's comment box (and reply boxes) has a Slack tick, ticked whenever
-- the project's settings would send that comment; unticking it keeps the
-- comment out of Slack. A client's comments have no tick and go as now.
-- The tick can only hold a comment back: the project's settings still
-- decide what goes.
--
-- comments_queue_slack is phase154's, with the one check added at its top.

alter table comments add column send_to_slack boolean not null default true;

create or replace function comments_queue_slack()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_client boolean;
begin
  if new.deleted_at is not null then return new; end if;
  -- Kept out of Slack by whoever wrote it.
  if not new.send_to_slack then return new; end if;
  if new.author_id is null then
    if new.body = 'Approved via shared review link.' then return new; end if;
    v_client := true;
  else
    v_client := new.for_client or exists (
      select 1 from memberships m
      where m.agency_id = new.agency_id and m.user_id = new.author_id and m.client_id is not null
    );
  end if;
  if not v_client then
    perform slack_queue(new.creative_id, 'team_comment', new.id, new.visibility = 'private');
  -- Asked for changes in the same moment the comment was written.
  elsif exists (
    select 1 from creatives
    where id = new.creative_id and exception = 'changes_requested' and updated_at = now()
  ) then
    perform slack_queue(new.creative_id, 'changes_requested', new.id);
  else
    perform slack_queue(new.creative_id, 'client_comment', new.id);
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
