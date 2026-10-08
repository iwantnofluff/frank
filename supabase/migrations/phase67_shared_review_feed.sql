-- Phase 67 — a review link's feed shows the project's other posts, by
-- stage only.
--
-- Decided directly (8 Oct 2026): a review link gets a Feed beside the post,
-- like the Review page's Feed Preview. Its posts sit in the grid in the
-- project's order; the ones this link shares can be opened, and every
-- other post shows only as a tile with its stage (In Progress, Internal
-- Review…). Asked and answered: stage only, no name, no artwork.
--
-- So this returns, for each of the project's posts in grid order, just:
-- its id if (and only if) this link already shares it, its stage, and
-- whether it's a Reel (for the feed's Reels tab). Nothing else about a post
-- the link doesn't share leaves the database. The token and passcode are
-- checked exactly as get_shared_review checks them.

create or replace function get_shared_review_feed(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', case when cr.id = any(v_allowed_ids) then cr.id end,
    'stage', cr.stage,
    'reel', 'ig_reel' = any(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end)
  ) order by cr.position), '[]'::jsonb)
  into v_feed
  from creatives cr
  where cr.project_id = v_link.project_id and cr.archived_at is null;

  return jsonb_build_object('status', 'ok', 'feed', v_feed);
end;
$$;

grant execute on function get_shared_review_feed(text, text) to anon, authenticated;
