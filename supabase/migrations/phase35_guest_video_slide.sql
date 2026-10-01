-- Phase 35 — a guest's comment at a moment on a carousel's video slide
-- records which slide (a carousel's slides can be videos, each with its
-- own timeline). submit_shared_comment (phase34) takes the slide as one
-- more optional argument; calls without it still work.
drop function if exists submit_shared_comment(text, text, uuid, text, text, text, numeric);

create or replace function submit_shared_comment(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_body text,
  p_guest_name text,
  p_guest_email text,
  p_at_seconds numeric default null,
  p_slide int default null
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

  insert into comments (creative_id, body, guest_name, guest_email, visibility, creative_version_id, anchor)
  values (
    p_creative_id, trim(p_body), trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public',
    v_version_id,
    case when p_at_seconds is null then null
         when p_slide is null then jsonb_build_object('type', 'time', 't', round(p_at_seconds, 2))
         else jsonb_build_object('type', 'time', 't', round(p_at_seconds, 2), 'slide', p_slide) end
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;

grant execute on function submit_shared_comment(text, text, uuid, text, text, text, numeric, int) to anon, authenticated;
