-- Phase 34 — Reels: bigger uploads, and comments at a moment in the video.
--
-- 1. Upload size. The assets bucket stopped at 25MB, though the app said
--    videos could be 500MB — a 30MB file was rejected ("exceeded the
--    maximum allowed size"). Decided directly: 50MB, the most the Free plan
--    allows per file. Images stay at 25MB (checked in the app).
update storage.buckets set file_size_limit = 52428800 where id = 'assets';

-- 2. A comment at a moment in a video records the time in its anchor
--    (comments.anchor is jsonb, so no column): a pin or box gets "t", and a
--    comment at a moment without one is { "type": "time", "t": 12.4 }.
--
--    Decided directly: guests on the review link can comment at a moment
--    too (without pins or boxes). submit_shared_comment takes the time as
--    one more, optional, argument — so a call without it still works — and
--    ties the comment to the version being watched (the latest), which the
--    time only makes sense against.
drop function if exists submit_shared_comment(text, text, uuid, text, text, text);

create or replace function submit_shared_comment(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_body text,
  p_guest_name text,
  p_guest_email text,
  p_at_seconds numeric default null
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

  if p_at_seconds is not null then
    select id into v_version_id from creative_versions
    where creative_id = p_creative_id order by version_no desc limit 1;
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility, creative_version_id, anchor)
  values (
    p_creative_id, trim(p_body), trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public',
    v_version_id,
    case when p_at_seconds is null then null
         else jsonb_build_object('type', 'time', 't', round(p_at_seconds, 2)) end
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;

grant execute on function submit_shared_comment(text, text, uuid, text, text, text, numeric) to anon, authenticated;
