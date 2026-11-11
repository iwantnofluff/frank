-- Phase 149 — a comment logged by the team for the client (direct
-- instruction): feedback the client gave on the phone, WhatsApp, email or
-- in a meeting, written into Frank by someone on the team so analytics and
-- the rest of the team see it as the client's. Shown as "<Client> · via
-- <name> (<source>)".

-- 1. Which comments are the client's, logged by the team, and where the
--    client said it (optional).
alter table comments add column if not exists for_client boolean not null default false;
alter table comments add column if not exists client_source text;
alter table comments drop constraint if exists comments_client_source_check;
alter table comments add constraint comments_client_source_check check (
  client_source is null
  or (for_client and client_source in ('phone', 'whatsapp', 'email', 'meeting'))
);

-- 2. Only someone on the team logs a comment for the client: a guest or
--    one of the client's own people is the client already. Checked against
--    the author's place in the agency, not the caller, so it holds for any
--    writer; the agency from the post, since this can run before the
--    comment's own agency_id is filled in.
create or replace function comments_check_for_client()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.for_client and (
    new.author_id is null
    or not exists (
      select 1 from memberships m join creatives c on c.agency_id = m.agency_id
      where c.id = new.creative_id and m.user_id = new.author_id
        and m.client_id is null and m.removed_at is null
    )
  ) then
    raise exception 'Only the team can log a comment for the client';
  end if;
  return new;
end;
$$;
drop trigger if exists comments_check_for_client on comments;
create trigger comments_check_for_client
  before insert or update of for_client, author_id on comments
  for each row execute function comments_check_for_client();

-- 3. The team hears about it as a client comment, except whoever logged it.
create or replace function comments_notify_client_activity()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.for_client then
    perform notify_client_activity(new.creative_id, 'client_comment', new.id);
    delete from notifications where comment_id = new.id and user_id = new.author_id;
    return new;
  end if;
  if new.author_id is null then
    if new.body = 'Approved via shared review link.' then return new; end if;
  elsif not exists (
    select 1 from memberships m
    where m.agency_id = new.agency_id and m.user_id = new.author_id and m.client_id is not null
  ) then
    return new;
  end if;
  perform notify_client_activity(new.creative_id, 'client_comment', new.id);
  return new;
end;
$$;
