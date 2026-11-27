-- Approving a post at Client (direct instruction): an Approve button beside
-- Post for the client's people and the team, as Approve Concept is at
-- Concept. It moves the post to Approved, records who approved it, and
-- leaves a public comment in their name: "Client Approved" from a client's
-- person, "Approved" from the team (as "Client Approved Concept" and
-- "Approved Concept" are).
--
-- And the team moving a post to Approved by its status (the stage pills on
-- the post, or the Table's status) leaves the same "Approved" comment
-- (direct instruction). Not when it comes back from Live, which keeps its
-- approval as it was.

create or replace function approve_post(p_creative_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c creatives;
  v_staff boolean;
  v_body text;
  v_comment uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to approve a post';
  end if;
  select * into c from creatives where id = p_creative_id for update;
  if not found then
    raise exception 'This post no longer exists';
  end if;
  v_staff := can_see_creative_as_staff(c.id);
  -- The team who can see it, or the post's client's people.
  if not v_staff and not exists (select 1 from my_client_creative_ids() id where id = c.id) then
    raise exception 'You can''t approve this post';
  end if;
  if c.archived_at is not null then
    raise exception 'This post is archived';
  end if;
  if c.stage <> 4 then
    raise exception 'This post isn''t waiting on the client''s review';
  end if;

  update creatives
  set stage = 5,
      exception = null,
      approved_at = now(),
      approved_by_name = (select name from users where id = auth.uid()),
      approved_by_email = (select email from users where id = auth.uid())
  where id = c.id;

  v_body := case when v_staff then 'Approved' else 'Client Approved' end;
  insert into comments (creative_id, author_id, body, visibility)
  values (c.id, auth.uid(), v_body, 'public')
  returning id into v_comment;

  return jsonb_build_object('stage', 5, 'comment_id', v_comment, 'body', v_body);
end;
$$;

revoke all on function approve_post(uuid) from public, anon;
grant execute on function approve_post(uuid) to authenticated;

-- As before, plus the "Approved" comment when the team newly approves.
create or replace function advance_creative_stage(p_creative_id uuid, p_direction text)
returns creatives
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_creative creatives%rowtype;
  v_was smallint;
begin
  select * into v_creative from creatives where id = p_creative_id;
  if not found then
    raise exception 'creative not found';
  end if;
  if not is_agency_staff(v_creative.agency_id) then
    raise exception 'not permitted';
  end if;
  if not exists (
    select 1 from projects
    where projects.id = v_creative.project_id
      and projects.id in (select staff_visible_project_ids(v_creative.agency_id))
  ) then
    raise exception 'not permitted for this creative''s client';
  end if;

  if p_direction = 'to_internal' then
    if v_creative.stage = 3 then
      raise exception 'already at Internal Review';
    end if;
    update creatives
    set stage = 3, approved_at = null, approved_by_name = null, approved_by_email = null
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_review' then
    if v_creative.stage = 4 then
      raise exception 'already at Client Review';
    end if;
    update creatives
    set stage = 4, approved_at = null, approved_by_name = null, approved_by_email = null
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_approved' then
    if v_creative.stage = 5 then
      raise exception 'already approved';
    end if;
    v_was := v_creative.stage;
    -- Back from Live (phase98/99): still approved as it was.
    update creatives
    set stage = 5,
        exception = null,
        approved_at = coalesce(case when v_creative.stage = 6 then v_creative.approved_at end, now()),
        approved_by_name = case when v_creative.stage = 6 and v_creative.approved_at is not null then v_creative.approved_by_name else (select name from users where id = auth.uid()) end,
        approved_by_email = case when v_creative.stage = 6 and v_creative.approved_at is not null then v_creative.approved_by_email else (select email from users where id = auth.uid()) end
    where id = p_creative_id
    returning * into v_creative;
    if v_was <> 6 then
      insert into comments (creative_id, author_id, body, visibility)
      values (p_creative_id, auth.uid(), 'Approved', 'public');
    end if;
  elsif p_direction = 'to_live' then
    if v_creative.stage = 6 then
      raise exception 'already live';
    end if;
    update creatives
    set stage = 6, exception = null
    where id = p_creative_id
    returning * into v_creative;
  else
    raise exception 'unknown direction: %', p_direction;
  end if;

  return v_creative;
end;
$$;
