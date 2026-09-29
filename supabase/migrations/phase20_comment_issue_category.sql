-- Comment intelligence, Phase 1 — classify every comment into a small fixed
-- taxonomy at the point it's created (docs/frank-data-intelligence.pdf,
-- "1. Comment intelligence"). issue_category is written by a follow-up,
-- best-effort AI call (app/api/ai/classify-comment/route.ts), never by the
-- insert itself — every comment-inserting statement below is otherwise
-- byte-for-byte the same as before, only gaining `returning id` so the
-- caller can fire that follow-up call with the new row's id.
--
-- 'no_issue' is the one category not in the source doc's own list of
-- eight — added here, disclosed rather than assumed, for comments that
-- aren't a correction at all (plain praise, the fixed "Approved via shared
-- review link." message, a Make Changes click with an empty box).
alter table comments add column issue_category text;
alter table comments add column issue_category_note text;
alter table comments add constraint comments_issue_category_check check (
  issue_category is null or issue_category in (
    'claim_or_compliance',
    'tone_and_brand',
    'craft_and_layout',
    'copy_clarity',
    'factual_error',
    'scope_change',
    'preference',
    'timing',
    'no_issue'
  )
);

create index comments_creative_category_idx
  on comments (creative_id, issue_category, created_at desc)
  where issue_category is not null;

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
  v_comment_id uuid;
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
  values (p_creative_id, trim(p_body), trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public')
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
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
  where id = p_creative_id;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Approved via shared review link.',
    trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public'
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;

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
  )
  returning id into v_comment_id;

  return jsonb_build_object('status', 'ok', 'comment_id', v_comment_id);
end;
$$;
