-- Phase 53 — approving through a review link counts once.
--
-- Reported directly (4 Oct 2026): a guest clicked Approve twice while the
-- page was catching up, and the post got two "Approved via shared review
-- link." comments. The update is now the check: it only changes a post
-- that isn't already approved, and only then is the comment added. Two
-- clicks at the same moment can't both get through: the second waits on
-- the first's row lock, then finds the post approved. A repeat answers
-- 'ok' (the post is approved, which is what they asked), with no comment.
-- Otherwise as phase20.

create or replace function submit_shared_approval(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_guest_name text,
  p_guest_email text
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_comment_id uuid;
begin
  select * into v_link from shared_links
  where token = p_token and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not v_link.can_approve then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if v_link.requires_passcode
     and (p_passcode is null or crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash) then
    return jsonb_build_object('status', 'passcode_required');
  end if;
  if p_guest_name is null or trim(p_guest_name) = '' then
    return jsonb_build_object('status', 'name_required');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  update creatives
  set stage = 4,
      exception = null,
      approved_at = now(),
      approved_by_name = trim(p_guest_name),
      approved_by_email = nullif(trim(p_guest_email), '')
  where id = p_creative_id
    and (stage is distinct from 4 or approved_at is null);
  if not found then
    return jsonb_build_object('status', 'ok', 'already_approved', true);
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Approved via shared review link.',
    trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public'
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;
