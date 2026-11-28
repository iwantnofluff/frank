-- A client's Preferences can say the agency approves (phase70,
-- client_can_approve). Review links have kept to it since; approve_post
-- (phase170) didn't, so a client's own people could still approve at
-- Client in Frank (found auditing Help, decided directly: they shouldn't).
-- As phase170, plus that check for anyone not on the team.

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
  -- The client's Preferences say the agency approves: not the client's
  -- own people, as on a review link.
  if not v_staff and exists (
    select 1 from client_preferences cp
    join projects p on p.client_id = cp.client_id
    where p.id = c.project_id and not cp.client_can_approve
  ) then
    raise exception 'Your agency approves posts for you';
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
