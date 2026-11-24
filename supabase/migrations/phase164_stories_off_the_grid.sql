-- Phase 164 — Stories aren't in a review link's grid.
--
-- Decided directly (24 Nov 2026): a Story is never on the feed, so it
-- never appears in the grid. A post whose every format is a Story
-- (Instagram Story, Facebook Story, WhatsApp Status, Meta Stories / Reels
-- Ad) is left out of the review link's Feed view; one made for a feed as
-- well stays, as does one with no format yet. Matches onGrid in
-- lib/formats.ts, which the post page's grid uses. The post itself is
-- still on the link to review.

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
    'id', case when cr.id = any(v_allowed_ids) then cr.id end,
    'name', case when not (cr.id = any(v_allowed_ids)) and cr.stage <= 3 then cr.name end,
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
