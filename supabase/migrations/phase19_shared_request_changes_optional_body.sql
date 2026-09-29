-- Make Changes no longer requires draft text — it should stay clickable the
-- same way Approve always is, not go grey the moment the box empties (a
-- guest may click it with nothing typed, same as Approve posts its own
-- fixed message with no body at all). p_body becomes optional; an empty
-- one falls back to a fixed message mirroring submit_shared_approval's own
-- "Approved via shared review link." shape.
create or replace function submit_shared_request_changes(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_body text,
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

  -- creatives_exception_stage only allows a non-null exception at stage
  -- 1-3 — an already-approved (stage 4) creative simply can't take this
  -- path. Scoped by the where clause rather than raising: matches this
  -- schema's own established convention of a write silently having no
  -- effect where it doesn't apply, the same shape as an RLS-blocked update.
  update creatives
  set exception = 'changes_requested'
  where id = p_creative_id and stage between 1 and 3;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id,
    coalesce(nullif(trim(p_body), ''), 'Changes requested via shared review link.'),
    trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public'
  );

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function submit_shared_request_changes(text, text, uuid, text, text, text) to anon, authenticated;
