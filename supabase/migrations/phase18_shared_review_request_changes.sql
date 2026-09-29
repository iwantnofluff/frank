-- submit_shared_request_changes replaces submit_shared_review_ack --------
-- "Mark as Reviewed" (phase17) turned out not to earn its keep once Approve
-- itself became gated on outstanding feedback — a lighter, comment-only
-- acknowledgement added nothing a real comment didn't already say. Replaced
-- with a real decision: Approve (clean, nothing to fix) or Make Changes
-- (there's feedback, and the creative's own status should say so) — the
-- schema's exception column has existed since phase13 but nothing has ever
-- set it to 'changes_requested' from any real code path until now.
drop function if exists submit_shared_review_ack(text, text, uuid, text, text);

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
  if p_body is null or trim(p_body) = '' then
    return jsonb_build_object('status', 'body_required');
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
  values (p_creative_id, trim(p_body), trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public');

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function submit_shared_request_changes(text, text, uuid, text, text, text) to anon, authenticated;

-- get_shared_review needs to hand back each creative's exception too, so
-- the guest page can gate Approve on it persistently (not just on whatever
-- happens to be sitting in the comment box right now).
create or replace function get_shared_review(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_project jsonb;
  v_creatives jsonb;
  v_client_id uuid;
  v_contacts jsonb;
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

  select p.client_id, jsonb_build_object('id', p.id, 'name', p.name, 'delivery', p.delivery)
    into v_client_id, v_project
    from projects p where p.id = v_link.project_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', cc.id, 'name', cc.name, 'email', cc.email) order by cc.name), '[]'::jsonb)
    into v_contacts
    from client_contacts cc
    where cc.client_id = v_client_id and cc.archived_at is null;

  select coalesce(jsonb_agg(c order by c.position), '[]'::jsonb) into v_creatives
  from (
    select
      cr.id, cr.name, cr.format, cr.stage, cr.exception, cr.position,
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
        -- Public, non-deleted only — this is the strip that matters. Private
        -- comments and anything soft-deleted are never fetched, so there is
        -- no "filter it out before sending" step for a bug to skip.
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
    'creatives', v_creatives,
    'contacts', v_contacts
  );
end;
$$;

grant execute on function get_shared_review(text, text) to anon, authenticated;
