-- Phase 150 — share a post at any status (direct instruction): the account
-- manager decides whether to send it. A link shows the posts it was made
-- for at any status ("All posts" all of them, decided directly), still
-- every post in Client Review besides, and never an Idea (no date). The
-- client comments, approves or asks for changes only while a post is in
-- Client Review; otherwise the link is theirs to read.

create or replace function shared_link_allowed_creative_ids(v_link shared_links)
returns uuid[]
language sql stable security definer set search_path = public as $$
  select array_agg(id) from creatives
  where project_id = v_link.project_id
    and archived_at is null
    and (scheduled_at is not null or due_on is not null)
    and (
      stage = 4
      or case v_link.scope
        when 'all' then true
        when 'pending' then false
        when 'one' then id = v_link.creative_id
        when 'pick' then id = any(v_link.picked_creatives)
        else false
      end
    );
$$;

-- In Client Review (stage 4), where the client has their say.
create or replace function shared_link_post_at_review(p_creative_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select stage = 4 from creatives where id = p_creative_id), false);
$$;
revoke execute on function shared_link_post_at_review(uuid) from public, anon, authenticated;

create or replace function submit_shared_comment(p_token text, p_passcode text, p_creative_id uuid, p_body text, p_guest_name text, p_guest_email text, p_at_seconds numeric default null, p_slide integer default null, p_edit_key text default null)
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
  if not shared_link_post_at_review(p_creative_id) then
    return jsonb_build_object('status', 'not_at_review');
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

create or replace function submit_shared_approval(p_token text, p_passcode text, p_creative_id uuid, p_guest_name text, p_guest_email text)
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
  -- Before Client Review, nothing to approve yet (phase150); after it,
  -- already approved, as before.
  if exists (select 1 from creatives where id = p_creative_id and stage < 4) then
    return jsonb_build_object('status', 'not_at_review');
  end if;

  -- A post already Live stays Live (phase99).
  update creatives
  set stage = greatest(stage, 5),
      exception = null,
      approved_at = now(),
      approved_by_name = v_name,
      approved_by_email = lower(btrim(p_guest_email))
  where id = p_creative_id
    and (stage < 5 or approved_at is null);
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

create or replace function submit_shared_request_changes(p_token text, p_passcode text, p_creative_id uuid, p_body text, p_guest_name text, p_guest_email text)
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
  v_name := shared_link_contact_name(v_link, p_guest_email);
  if v_name is null then
    return jsonb_build_object('status', 'not_on_client');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if not shared_link_post_at_review(p_creative_id) then
    return jsonb_build_object('status', 'not_at_review');
  end if;

  update creatives
  set exception = 'changes_requested'
  where id = p_creative_id and stage between 1 and 4;

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

create or replace function edit_shared_comment(p_token text, p_passcode text, p_comment_id uuid, p_edit_key text, p_body text)
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
  -- Read only away from Client Review (phase150).
  if not shared_link_post_at_review(v_comment.creative_id) then
    return jsonb_build_object('status', 'not_at_review');
  end if;

  perform set_config('frank.guest_comment_edit', 'on', true);
  update comments set body = trim(p_body), edited_at = now()
  where id = p_comment_id and body is distinct from trim(p_body);
  perform set_config('frank.guest_comment_edit', '', true);

  return jsonb_build_object('status', 'ok');
end;
$$;
