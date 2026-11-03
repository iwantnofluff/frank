-- Phase 138 — @mentions in a post's comments.
--
-- Decided directly (3 Nov 2026): typing @ in a post's comment box, or a
-- reply, offers the project's team, as a project's Discussion does
-- (phase84). Whoever's mentioned gets a notice in the bell (the bell only,
-- no email), if they're on the project's team, never the author. Editing a
-- comment to add someone tells only the newcomer. The team mentions; a
-- client's people and review-link guests don't.

-- 1. Who a comment mentions.
alter table comments add column if not exists mentions uuid[] not null default '{}';

-- Only its author says who it mentions, and only someone on the project's
-- team mentions at all; anyone else's are dropped. The service role (no
-- caller) is left alone, as comments_body_own_only does.
create or replace function comments_mentions_guard()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_project uuid;
begin
  if tg_op = 'UPDATE' and new.mentions is not distinct from old.mentions then
    return new;
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null
     and (old.author_id is null or old.author_id <> auth.uid()) then
    raise exception 'only its author can change who a comment mentions';
  end if;
  if cardinality(new.mentions) = 0 then return new; end if;
  select project_id into v_project from creatives where id = new.creative_id;
  if new.author_id is null or v_project is null
     or new.author_id not in (select project_team(v_project)) then
    new.mentions := '{}';
    return new;
  end if;
  -- Kept to the team, once each, never the author.
  new.mentions := array(
    select distinct m from unnest(new.mentions) m
    where m <> new.author_id and m in (select project_team(v_project))
  );
  return new;
end;
$$;
revoke execute on function comments_mentions_guard() from public, anon, authenticated;

drop trigger if exists comments_mentions_guard on comments;
create trigger comments_mentions_guard
  before insert or update of mentions on comments
  for each row execute function comments_mentions_guard();

-- 2. The notice.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('artwork_removal', 'client_comment', 'client_approval', 'discussion_mention', 'live_unapproved', 'comment_mention'));

-- Whoever's newly mentioned and on the team, not the author. One per
-- person and comment (notifications_one_per_comment, phase80): a client's
-- comment never mentions anyone (above), so it never meets a client_comment
-- notice for the same comment.
create or replace function comments_notify_mentions()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_project uuid;
begin
  if new.deleted_at is not null or cardinality(new.mentions) = 0 then return new; end if;
  select project_id into v_project from creatives where id = new.creative_id;
  if v_project is null then return new; end if;
  insert into notifications (agency_id, user_id, kind, creative_id, comment_id)
  select new.agency_id, m, 'comment_mention', new.creative_id, new.id
  from unnest(new.mentions) m
  where m <> new.author_id
    and (tg_op = 'INSERT' or not (m = any (old.mentions)))
    and m in (select project_team(v_project))
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function comments_notify_mentions() from public, anon, authenticated;

drop trigger if exists comments_notify_mentions on comments;
create trigger comments_notify_mentions
  after insert or update of mentions on comments
  for each row execute function comments_notify_mentions();

notify pgrst, 'reload schema';
