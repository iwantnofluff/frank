-- Phase 167 — a client comments only in Client Review, and changes no status.
--
-- Decided directly (26 Nov 2026): signed in, a client's people comment on a
-- post only while it's in Client Review (stage 4), and change no status.
-- Until now the post page hid the comments outside Concept and Client
-- Review, but the database took a client's comment at any stage, and
-- approve_concept (phase115) let a client move a post from Concept to In
-- Production. Both now hold in the database, not just on screen.
--
-- The team is unchanged. Review links are unchanged: a guest comments through
-- their own SECURITY DEFINER functions, which already keep to Client Review.

-- 1. A comment from anyone who isn't on the team needs its post in Client
--    Review. The rest is phase46's rule as it stands.
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
        and (is_agency_staff(comments.agency_id) or creatives.stage = 4)
    )
  );

-- 2. Approving a concept is the team's only.
create or replace function approve_concept(p_creative_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c creatives;
  v_body text := 'Approved Concept';
  v_comment uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to approve a concept';
  end if;
  select * into c from creatives where id = p_creative_id for update;
  if not found then
    raise exception 'This post no longer exists';
  end if;
  -- The team who can see it (a client's people too until phase167).
  if not can_see_creative_as_staff(c.id) then
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

  insert into comments (creative_id, author_id, body, visibility)
  values (c.id, auth.uid(), v_body, 'public')
  returning id into v_comment;

  return jsonb_build_object('stage', 2, 'comment_id', v_comment, 'body', v_body);
end;
$$;

revoke all on function approve_concept(uuid) from public, anon;
grant execute on function approve_concept(uuid) to authenticated;
