-- Phase 166 — a review link's Feed shows Approved and Live posts as they are.
--
-- Decided directly (25 Nov 2026): on a review link's Feed, the project's
-- Approved and Live posts the link doesn't share show their artwork, name
-- and date, as on the Review page's Feed Preview, instead of their stage
-- alone (phase67's rule, which stays for Concept to Client Review: name
-- in Internal stages, stage only otherwise). They never open. This now
-- returns their id (for /api/shared-review to sign their artwork; no
-- storage key leaves here), whether the link shares the post, and their
-- date. Otherwise as phase164.

create or replace function get_shared_review_feed(p_token text, p_passcode text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_others boolean;
  v_feed jsonb;
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

  v_allowed_ids := coalesce(shared_link_allowed_creative_ids(v_link), '{}');
  select coalesce(cp.feed_shows_other_posts, true) into v_others
    from projects p left join client_preferences cp on cp.client_id = p.client_id
    where p.id = v_link.project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    -- Approved and Live posts the link doesn't share have their id too,
    -- for their artwork (signed by /api/shared-review), but never open.
    'id', case when cr.id = any(v_allowed_ids) or cr.stage >= 5 then cr.id end,
    'shared', cr.id = any(v_allowed_ids),
    'name', case when not (cr.id = any(v_allowed_ids)) and (cr.stage <= 3 or cr.stage >= 5) then cr.name end,
    'date', case when not (cr.id = any(v_allowed_ids)) and cr.stage >= 5
      then coalesce(cr.scheduled_at, coalesce(cr.publish_on, cr.due_on)::timestamptz) end,
    'stage', cr.stage,
    'reel', 'ig_reel' = any(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end)
  ) order by coalesce(cr.scheduled_at, coalesce(cr.publish_on, cr.due_on)::timestamptz) desc nulls first, cr.position), '[]'::jsonb)
  into v_feed
  from creatives cr
  where cr.project_id = v_link.project_id and cr.archived_at is null
    and not exists (select 1 from stage_statuses s where s.id = cr.status_id and s.hides_post)
    and (coalesce(v_others, true) or cr.id = any(v_allowed_ids))
    -- On the feed: some format that isn't a Story, or none yet.
    and exists (
      select 1 from unnest(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end) f
      where f is null or f not in ('ig_story', 'fb_story', 'wa_status', 'meta_story')
    );

  return jsonb_build_object('status', 'ok', 'feed', v_feed);
end;
$$;
