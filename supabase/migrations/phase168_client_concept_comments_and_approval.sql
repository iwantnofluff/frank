-- Phase 168 — a client comments in Concept too, and approves a concept.
--
-- Decided directly (26 Nov 2026), on top of phase167: signed in, a client's
-- people comment on a post while it's in Concept or Client Review (stages 1
-- and 4), and approve its Concept, as phase115 first had it. Approving a
-- concept is the only stage a client changes; the rest stay the team's.
--
-- The team is unchanged. Review links are unchanged.

-- 1. A comment from anyone who isn't on the team needs its post in Concept
--    or Client Review. The rest is phase46's rule as it stands.
drop policy comments_insert on comments;
create policy comments_insert on comments
  as permissive for insert to public
  with check (
    agency_id in (select current_agency_ids())
    and exists (
      select 1
      from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = comments.creative_id
        and projects.id in (select visible_project_ids(comments.agency_id))
        and (is_agency_staff(comments.agency_id) or creatives.stage in (1, 4))
    )
  );

-- 2. Approving a concept: the team who can see it, or the post's client's
--    people (phase115's rule again), recorded in the approver's name.
create or replace function approve_concept(p_creative_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c creatives;
  v_staff boolean;
  v_body text;
  v_comment uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to approve a concept';
  end if;
  select * into c from creatives where id = p_creative_id for update;
  if not found then
    raise exception 'This post no longer exists';
  end if;
  v_staff := can_see_creative_as_staff(c.id);
  -- The team who can see it, or the post's client's people.
  if not v_staff and not exists (select 1 from my_client_creative_ids() id where id = c.id) then
    raise exception 'You can''t approve this concept';
  end if;
  if c.archived_at is not null then
    raise exception 'This post is archived';
  end if;
  if c.stage <> 1 then
    raise exception 'This concept has already moved on';
  end if;
  if coalesce(btrim(c.concept), '') = '' then
    raise exception 'Write the concept before it''s approved';
  end if;

  update creatives set stage = 2 where id = c.id;

  v_body := case when v_staff then 'Approved Concept' else 'Client Approved Concept' end;
  insert into comments (creative_id, author_id, body, visibility)
  values (c.id, auth.uid(), v_body, 'public')
  returning id into v_comment;

  return jsonb_build_object('stage', 2, 'comment_id', v_comment, 'body', v_body);
end;
$$;

revoke all on function approve_concept(uuid) from public, anon;
grant execute on function approve_concept(uuid) to authenticated;
