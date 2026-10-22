-- Phase 115 — the concept is approved, not assumed.
--
-- Decided directly (22 Oct 2026): a post stays in Concept until someone
-- approves its concept, the client or anyone on the team, from the post's
-- comments (beside Post) or its Concept & Reference cell in the table.
-- Approving moves it to In Production and records a comment in the
-- approver's name: "Client Approved Concept" from the client's people,
-- "Approved Concept" from the team. Adding artwork or copy still moves a
-- post on to Internal Review, approved or not (decided directly), as
-- phase102 has it.
--
-- So writing a Concept no longer moves a post on by itself (phase102's
-- creatives_enter_production). Posts already in In Production stay there.

drop trigger if exists creatives_enter_production on creatives;
drop function if exists creatives_enter_production();

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
