-- A project's Activity (project_activity_feed, phase102) merged the
-- project's whole history — every post, version, comment, stage change,
-- link and log entry — and only then kept the newest 60. Each part now
-- keeps its own newest page first (speed pass, 2 Nov 2026): the newest 60
-- overall are always among each part's newest 60, so the answer is the
-- same, but the work no longer grows with the project's age. Same
-- signature, same rows, still run as the person asking (their row rules
-- apply as before).

create or replace function project_activity_feed(p_project_id uuid, p_before timestamptz default null, p_limit integer default 60)
returns table (at timestamptz, kind text, by_user uuid, by_name text, creative_id uuid, creative_name text, detail jsonb)
language sql stable set search_path = public, extensions as $$
  with lim as (select least(greatest(p_limit, 1), 200) as n),
  posts as (
    select id, name, created_by, created_at, approved_by_name from creatives where project_id = p_project_id
  ),
  everything as (
    (select c.created_at as at, 'post_created'::text as kind, c.created_by as by_user, null::text as by_guest,
            c.id as creative_id, c.name as creative_name, '{}'::jsonb as detail
     from posts c
     where p_before is null or c.created_at < p_before
     order by 1 desc limit (select n from lim))
    union all
    (select e.at, 'stage', e.by_user, case when e.to_stage = 5 and e.by_user is null then c.approved_by_name end,
            c.id, c.name, jsonb_build_object('from', e.from_stage, 'to', e.to_stage, 'exception', e.exception)
     from creative_stage_events e join posts c on c.id = e.creative_id
     where e.from_stage is not null and (p_before is null or e.at < p_before)
     order by 1 desc limit (select n from lim))
    union all
    (select v.created_at, 'artwork_version', v.created_by, null, c.id, c.name, jsonb_build_object('version', v.version_no)
     from creative_versions v join posts c on c.id = v.creative_id
     where p_before is null or v.created_at < p_before
     order by 1 desc limit (select n from lim))
    union all
    (select v.created_at, 'copy_version', v.created_by, null, c.id, c.name, jsonb_build_object('version', v.version_no)
     from copy_versions v join posts c on c.id = v.creative_id
     where p_before is null or v.created_at < p_before
     order by 1 desc limit (select n from lim))
    union all
    (select m.created_at, 'comment', m.author_id, m.guest_name, c.id, c.name,
            jsonb_build_object('internal', m.visibility = 'private', 'text', left(m.body, 140))
     from comments m join posts c on c.id = m.creative_id
     where m.deleted_at is null and (p_before is null or m.created_at < p_before)
     order by 1 desc limit (select n from lim))
    union all
    (select m.resolved_at, 'comment_resolved', m.resolved_by, null, c.id, c.name, jsonb_build_object('text', left(m.body, 140))
     from comments m join posts c on c.id = m.creative_id
     where m.resolved_at is not null and m.deleted_at is null and (p_before is null or m.resolved_at < p_before)
     order by 1 desc limit (select n from lim))
    union all
    (select l.created_at, 'link_shared', l.created_by, null, l.creative_id, (select name from posts where id = l.creative_id), '{}'::jsonb
     from shared_links l where l.project_id = p_project_id and (p_before is null or l.created_at < p_before)
     order by 1 desc limit (select n from lim))
    union all
    (select l.revoked_at, 'link_revoked', null, null, l.creative_id, (select name from posts where id = l.creative_id), '{}'::jsonb
     from shared_links l where l.project_id = p_project_id and l.revoked_at is not null and (p_before is null or l.revoked_at < p_before)
     order by 1 desc limit (select n from lim))
    union all
    (select a.at, a.kind, a.by_user, null, a.creative_id, coalesce((select name from posts where id = a.creative_id), a.detail->>'post'), a.detail
     from project_activity a where a.project_id = p_project_id and (p_before is null or a.at < p_before)
     order by 1 desc limit (select n from lim))
  )
  select e.at, e.kind, e.by_user, coalesce(u.name, e.by_guest), e.creative_id, e.creative_name, e.detail
  from everything e left join users u on u.id = e.by_user
  order by e.at desc
  limit (select n from lim);
$$;
