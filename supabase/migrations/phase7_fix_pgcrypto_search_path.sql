-- Fix — pgcrypto search_path regression from Phase 6
--
-- Found while smoke-testing Phase 7: get_shared_review, submit_shared_comment
-- and submit_shared_approval all failed with "function crypt(text, text)
-- does not exist". Each was hardened with `set search_path = public` to
-- close a search-path-hijacking risk (the standard reason to pin
-- search_path on a SECURITY DEFINER function) — but that also excluded
-- whatever schema pgcrypto's crypt()/gen_salt() actually live in. Supabase
-- provisions pgcrypto into `extensions` by default, not `public`, so the
-- narrowed search_path broke every passcode check.
--
-- Fix: widen the pinned search_path to `public, extensions` — still a
-- fixed, explicit list (the actual hijacking protection), just one that
-- includes where the functions really are. Safe to run any number of
-- times; CREATE OR REPLACE FUNCTION only touches these three definitions.

create or replace function get_shared_review(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_project jsonb;
  v_creatives jsonb;
begin
  select * into v_link from shared_links where token = p_token and revoked_at is null;

  if not found or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_link.requires_passcode then
    if p_passcode is null or p_passcode = '' then
      return jsonb_build_object('status', 'passcode_required');
    end if;
    if crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash then
      return jsonb_build_object('status', 'passcode_required', 'invalid', true);
    end if;
  end if;

  v_allowed_ids := shared_link_allowed_creative_ids(v_link);

  select jsonb_build_object('id', p.id, 'name', p.name, 'delivery', p.delivery)
    into v_project
    from projects p where p.id = v_link.project_id;

  select coalesce(jsonb_agg(c order by c.position), '[]'::jsonb) into v_creatives
  from (
    select
      cr.id, cr.name, cr.format, cr.stage, cr.position,
      cr.scheduled_at, cr.destination, cr.approved_at,
      (
        select jsonb_build_object(
          'version_no', cv.version_no, 'storage_key', a.storage_key,
          'mime_type', a.mime_type, 'filename', a.filename
        )
        from creative_versions cv join assets a on a.id = cv.asset_id
        where cv.creative_id = cr.id order by cv.version_no desc limit 1
      ) as asset,
      (
        select jsonb_build_object('version_no', cpv.version_no, 'fields', cpv.fields)
        from copy_versions cpv
        where cpv.creative_id = cr.id order by cpv.version_no desc limit 1
      ) as copy,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', cm.id,
          'author_name', coalesce(u.name, cm.guest_name),
          'body', cm.body,
          'created_at', cm.created_at
        ) order by cm.created_at), '[]'::jsonb)
        from comments cm left join users u on u.id = cm.author_id
        where cm.creative_id = cr.id and cm.visibility = 'public' and cm.deleted_at is null
      ) as comments
    from creatives cr
    where cr.id = any(v_allowed_ids)
  ) c;

  return jsonb_build_object(
    'status', 'ok',
    'scope', v_link.scope,
    'can_approve', v_link.can_approve,
    'project', v_project,
    'creatives', v_creatives
  );
end;
$$;

create or replace function submit_shared_comment(
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
  if p_body is null or trim(p_body) = '' then
    return jsonb_build_object('status', 'body_required');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (p_creative_id, trim(p_body), trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public');

  return jsonb_build_object('status', 'ok');
end;
$$;

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
  set stage = 6,
      approved_at = now(),
      approved_by_name = trim(p_guest_name),
      approved_by_email = nullif(trim(p_guest_email), '')
  where id = p_creative_id;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Approved via shared review link.',
    trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public'
  );

  return jsonb_build_object('status', 'ok');
end;
$$;
