-- Phase 77 — only the client's own people comment on a review link.
--
-- Decided directly (9 Oct 2026), after a No Fluff link took a comment from
-- someone at Casa Carigar: a review link's guest comments, approves or asks
-- for changes only as one of the people on that link's client's list
-- (client_contacts: its Clients, kept in step by phase45, and any names
-- already there). The link picks from the list; there's no "Someone
-- else" any more. Matched on the email, case aside; the name stored is the
-- list's own. Anyone else gets status 'not_on_client'.
--
-- A link has no sign-in, so this stops strangers and names from the wrong
-- client, not someone with the link picking a listed name (decided
-- directly: names from the list, no emailed code).

create or replace function shared_link_contact_name(p_link shared_links, p_email text)
returns text
language sql stable security definer set search_path = public, extensions as $$
  select cc.name from client_contacts cc
  join projects p on p.client_id = cc.client_id
  where p.id = p_link.project_id and cc.archived_at is null
    and p_email is not null and lower(cc.email) = lower(btrim(p_email))
  order by cc.created_at
  limit 1;
$$;
revoke execute on function shared_link_contact_name(shared_links, text) from public, anon, authenticated;

-- phase75's submit_shared_comment, with the check.
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
  v_name text;
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
  -- Only the client's own people (phase77).
  v_name := shared_link_contact_name(v_link, p_guest_email);
  if v_name is null then
    return jsonb_build_object('status', 'not_on_client');
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
    p_creative_id, trim(p_body), v_name, lower(btrim(p_guest_email)), 'public',
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


-- phase70's submit_shared_approval, with the check.
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
  v_name text;
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
  if exists (
    select 1 from projects p join client_preferences cp on cp.client_id = p.client_id
    where p.id = v_link.project_id and not cp.client_can_approve
  ) then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if v_link.requires_passcode
     and (p_passcode is null or crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash) then
    return jsonb_build_object('status', 'passcode_required');
  end if;
  if p_guest_name is null or trim(p_guest_name) = '' then
    return jsonb_build_object('status', 'name_required');
  end if;
  -- Only the client's own people (phase77).
  v_name := shared_link_contact_name(v_link, p_guest_email);
  if v_name is null then
    return jsonb_build_object('status', 'not_on_client');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  update creatives
  set stage = 4,
      exception = null,
      approved_at = now(),
      approved_by_name = v_name,
      approved_by_email = lower(btrim(p_guest_email))
  where id = p_creative_id
    and (stage is distinct from 4 or approved_at is null);
  if not found then
    return jsonb_build_object('status', 'ok', 'already_approved', true);
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Approved via shared review link.',
    v_name, lower(btrim(p_guest_email)), 'public'
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;

-- phase20's submit_shared_request_changes (no longer offered on the page,
-- still callable), with the check.
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
  v_comment_id uuid;
  v_name text;
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
  -- Only the client's own people (phase77).
  v_name := shared_link_contact_name(v_link, p_guest_email);
  if v_name is null then
    return jsonb_build_object('status', 'not_on_client');
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
    v_name, lower(btrim(p_guest_email)), 'public'
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;
