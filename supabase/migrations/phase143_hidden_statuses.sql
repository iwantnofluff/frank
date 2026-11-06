-- Phase 143 — statuses that hide their posts (direct instruction, 6 Nov
-- 2026: a Cancelled post shouldn't appear). A status can be set to hide
-- its posts; Cancel is, in every project and in every new one. Hidden
-- posts are left out of the team's lists (the app filters them, with a
-- Show Hidden tick to bring them back), and here out of the dashboard's
-- counts and a review link's feed. History (activity, notifications,
-- analytics) still shows them.

alter table project_statuses add column if not exists hides_post boolean not null default false;

update project_statuses set hides_post = true where lower(trim(label)) in ('cancel', 'cancelled', 'canceled');

-- New projects: Cancel hides its posts.
create or replace function seed_project_statuses(p_project_id uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into project_statuses (project_id, stage, label, position, hides_post)
  values
    (p_project_id, 2, 'In Progress (Content)', 0, false),
    (p_project_id, 2, 'In Progress (Creative)', 1, false),
    (p_project_id, 3, 'Internal QC (Copy)', 0, false),
    (p_project_id, 3, 'Internal QC (Creative)', 1, false),
    (p_project_id, 3, 'Hold', 2, false),
    (p_project_id, 3, 'Cancel', 3, true)
$$;
revoke all on function seed_project_statuses(uuid) from public, anon, authenticated;

-- The dashboard's counts (phase133), without hidden posts.
create or replace function creative_stage_counts()
returns table (stage integer, exception text, n bigint)
language sql security invoker stable set search_path = public, extensions as $$
  select c.stage, c.exception::text, count(*)
  from creatives c
  where c.archived_at is null
    and not exists (select 1 from project_statuses s where s.id = c.status_id and s.hides_post)
  group by c.stage, c.exception;
$$;

create or replace function client_list_stats()
returns table (client_id uuid, active_projects bigint, last_activity timestamptz)
language sql security invoker stable set search_path = public, extensions as $$
  select cl.id,
    count(distinct p.id),
    max(cr.created_at)
  from clients cl
  left join projects p on p.client_id = cl.id and p.archived_at is null
  left join creatives cr on cr.project_id = p.id and cr.archived_at is null
    and not exists (select 1 from project_statuses s where s.id = cr.status_id and s.hides_post)
  group by cl.id;
$$;

revoke execute on function creative_stage_counts() from public, anon;
revoke execute on function client_list_stats() from public, anon;
grant execute on function creative_stage_counts() to authenticated;
grant execute on function client_list_stats() to authenticated;

-- A review link's feed (phase140's), without hidden posts.
create or replace function get_shared_review_feed(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_others boolean;
  v_feed jsonb;
begin
  select * into v_link from shared_links where token = p_token and revoked_at is null;

  if not found or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_link.requires_passcode then
    if p_passcode is null or p_passcode = '' then
      return jsonb_build_object('status', 'passcode_required');
    end if;
    if crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash then
      return jsonb_build_object('status', 'passcode_required', 'invalid', true);
    end if;
  end if;

  v_allowed_ids := coalesce(shared_link_allowed_creative_ids(v_link), '{}');
  select coalesce(cp.feed_shows_other_posts, true) into v_others
    from projects p left join client_preferences cp on cp.client_id = p.client_id
    where p.id = v_link.project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', case when cr.id = any(v_allowed_ids) then cr.id end,
    'name', case when not (cr.id = any(v_allowed_ids)) and cr.stage <= 3 then cr.name end,
    'stage', cr.stage,
    'reel', 'ig_reel' = any(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end)
  ) order by coalesce(cr.scheduled_at, coalesce(cr.publish_on, cr.due_on)::timestamptz) desc nulls first, cr.position), '[]'::jsonb)
  into v_feed
  from creatives cr
  where cr.project_id = v_link.project_id and cr.archived_at is null
    and not exists (select 1 from project_statuses s where s.id = cr.status_id and s.hides_post)
    and (coalesce(v_others, true) or cr.id = any(v_allowed_ids));

  return jsonb_build_object('status', 'ok', 'feed', v_feed);
end;
$$;
grant execute on function get_shared_review_feed(text, text) to anon, authenticated;
