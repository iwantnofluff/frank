-- submit_shared_review_ack ---------------------------------------------------
-- A lighter alternative to submit_shared_approval — "I looked at this, no
-- changes needed" without the formal approval semantics (no stage change,
-- no approved_at/approved_by). Direct ask: a guest should be able to close
-- out a creative without being forced into either Post-a-comment or
-- Approve, since Approve carries real workflow weight the guest may not be
-- the one authorized (or ready) to give. Not gated on can_approve — anyone
-- who can comment can leave this same lightweight acknowledgement.
create or replace function submit_shared_review_ack(
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
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Reviewed via shared review link — no changes needed.',
    trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public'
  );

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function submit_shared_review_ack(text, text, uuid, text, text) to anon, authenticated;
