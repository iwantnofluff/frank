-- Phase 75 — editing your own comment on a review link.
--
-- Decided directly (9 Oct 2026): people edit their own comments. Signed-in
-- people already can (comments_update_own); a review link's guests have no
-- login, so a guest's comment carries an edit key instead: made in the
-- guest's browser and kept there, sent with the comment, stored here only
-- as its hash. The same browser can then edit it; another device can't
-- (decided directly). An edit changes the words only and marks it edited;
-- its mood for Analytics stays as first written (decided directly).

alter table comments add column if not exists guest_edit_key_hash text;

-- comments_update_own lets staff change any comment they can see (to
-- resolve it, or make it public); the words are its author's alone. A
-- signed-in person changes a comment's words only when it's theirs; a
-- guest's go through edit_shared_comment below, which says so. The service
-- role (no caller) is left alone.
create or replace function comments_body_own_only()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.body is distinct from old.body
     and auth.uid() is not null
     and coalesce(current_setting('frank.guest_comment_edit', true), '') <> 'on'
     and (old.author_id is null or old.author_id <> auth.uid()) then
    raise exception 'only its author can change a comment';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_body_own_only on comments;
create trigger comments_body_own_only
  before update of body on comments
  for each row execute function comments_body_own_only();

-- phase35's submit_shared_comment, taking the edit key as one more
-- optional argument; calls without it still work.
drop function if exists submit_shared_comment(text, text, uuid, text, text, text, numeric, int);

create or replace function submit_shared_comment(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_body text,
  p_guest_name text,
  p_guest_email text,
  p_at_seconds numeric default null,
  p_slide int default null,
  p_edit_key text default null
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_comment_id uuid;
  v_version_id uuid;
begin
  select * into v_link from shared_links
  where token = p_token and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_link.requires_passcode
     and (p_passcode is null or crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash) then
    return jsonb_build_object('status', 'passcode_required');
  end if;
  if p_guest_name is null or trim(p_guest_name) = '' then
    return jsonb_build_object('status', 'name_required');
  end if;
  if p_body is null or trim(p_body) = '' then
    return jsonb_build_object('status', 'body_required');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if p_at_seconds is not null and (p_at_seconds < 0 or p_at_seconds > 86400) then
    return jsonb_build_object('status', 'bad_time');
  end if;

  if p_slide is not null and (p_slide < 1 or p_slide > 20) then
    return jsonb_build_object('status', 'bad_slide');
  end if;

  if p_at_seconds is not null then
    select id into v_version_id from creative_versions
    where creative_id = p_creative_id order by version_no desc limit 1;
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility, creative_version_id, anchor, guest_edit_key_hash)
  values (
    p_creative_id, trim(p_body), trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public',
    v_version_id,
    case when p_at_seconds is null then null
         when p_slide is null then jsonb_build_object('type', 'time', 't', round(p_at_seconds, 2))
         else jsonb_build_object('type', 'time', 't', round(p_at_seconds, 2), 'slide', p_slide) end,
    case when length(p_edit_key) >= 32 then encode(digest(p_edit_key, 'sha256'), 'hex') end
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;

grant execute on function submit_shared_comment(text, text, uuid, text, text, text, numeric, int, text) to anon, authenticated;

-- A guest edits their own comment: the link must still be open and the
-- post on it, and the key must be the one the comment was made with.
create or replace function edit_shared_comment(
  p_token text,
  p_passcode text,
  p_comment_id uuid,
  p_edit_key text,
  p_body text
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_comment comments%rowtype;
begin
  select * into v_link from shared_links
  where token = p_token and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_link.requires_passcode
     and (p_passcode is null or crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash) then
    return jsonb_build_object('status', 'passcode_required');
  end if;
  if p_body is null or trim(p_body) = '' then
    return jsonb_build_object('status', 'body_required');
  end if;

  select * into v_comment from comments where id = p_comment_id and deleted_at is null;
  if not found
     or not coalesce(v_comment.creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if v_comment.guest_edit_key_hash is null or p_edit_key is null
     or encode(digest(p_edit_key, 'sha256'), 'hex') <> v_comment.guest_edit_key_hash then
    return jsonb_build_object('status', 'not_yours');
  end if;

  perform set_config('frank.guest_comment_edit', 'on', true);
  update comments set body = trim(p_body), edited_at = now()
  where id = p_comment_id and body is distinct from trim(p_body);
  perform set_config('frank.guest_comment_edit', '', true);

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function edit_shared_comment(text, text, uuid, text, text) to anon, authenticated;
