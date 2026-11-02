-- The dashboard's counts were made in the browser: every post's stage
-- downloaded to count Waiting on Approval and Feedback to Action, and every
-- post's date to find each client's Last Activity. Slow as a workspace
-- grows, and wrong past 1,000 posts, the most one request returns. Counted
-- in the database now (speed pass, 2 Nov 2026).
--
-- security invoker: each runs as the person asking, so their own row
-- rules decide what's counted, exactly as the reads they replace did.

-- Posts not archived, by stage and exception (the dashboard bands them as
-- lib/stage-labels.ts bandOf does).
create or replace function creative_stage_counts()
returns table (stage integer, exception text, n bigint)
language sql security invoker stable set search_path = public, extensions as $$
  select c.stage, c.exception::text, count(*)
  from creatives c
  where c.archived_at is null
  group by c.stage, c.exception;
$$;

-- Each client: its projects not archived, and the newest post in them
-- (not archived) — the dashboard's Projects and Last Activity columns.
create or replace function client_list_stats()
returns table (client_id uuid, active_projects bigint, last_activity timestamptz)
language sql security invoker stable set search_path = public, extensions as $$
  select cl.id,
    count(distinct p.id),
    max(cr.created_at)
  from clients cl
  left join projects p on p.client_id = cl.id and p.archived_at is null
  left join creatives cr on cr.project_id = p.id and cr.archived_at is null
  group by cl.id;
$$;

grant execute on function creative_stage_counts() to authenticated;
grant execute on function client_list_stats() to authenticated;
revoke execute on function creative_stage_counts() from anon;
revoke execute on function client_list_stats() from anon;
