-- Phase 140 — Other Content gets a Publish Date beside its Due Date, and
-- every project's columns go back to a new default order.
--
-- Decided directly (4 Nov 2026): an Other Content post has two dates. Its
-- Due Date (creatives.due_on, until now called its Live Date) is when the
-- work is due: it still groups the table into weeks, places the post on
-- the calendar and makes a post without one an Idea (phase106, unchanged).
-- Its Publish Date (creatives.publish_on, new) is when it goes live, so
-- what reads "when it goes live" moves to it, falling back to the Due Date
-- where a post has none yet: the planned date kept when a post goes Live,
-- when its artwork is removed after going live, and the review link
-- feed's newest-first order.

-- 1. The Publish Date, starting as each post's Live Date was, so nothing
--    moves until someone changes one of the two.
alter table creatives add column if not exists publish_on date;
update creatives set publish_on = due_on where due_on is not null and publish_on is null;

-- 2. The planned date a post went Live against (phase102's, its Publish
--    Date for an Other Content post).
create or replace function creatives_live_date()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.stage = 6 and old.stage is distinct from 6 then
    insert into post_live_dates (creative_id, agency_id, live_at, scheduled_at, source)
    values (new.id, new.agency_id, now(), coalesce(new.scheduled_at, coalesce(new.publish_on, new.due_on)::timestamptz), 'manual')
    on conflict (creative_id) do nothing;
  elsif old.stage = 6 and new.stage is distinct from 6 then
    delete from post_live_dates where creative_id = new.id and source = 'manual';
  end if;
  return new;
end;
$$;

-- 3. Artwork removed once a post's been live long enough (phase102's),
--    counted from its Publish Date.
create or replace function run_artwork_housekeeping(p_agency_id uuid default null)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_keys text[] := '{}';
begin
  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    left join client_preferences cp on cp.client_id = p.client_id
    left join post_live_dates l on l.creative_id = c.id
    where c.stage >= 5
      and c.scheduled_at is not null
      and coalesce(l.live_at, c.scheduled_at) < now() - make_interval(days => coalesce(cp.artwork_keep_days, 7))
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  for r in
    select c.id from creatives c
    join projects p on p.id = c.project_id
    join client_preferences cp on cp.client_id = p.client_id and cp.undated_artwork = 'remove'
    where c.stage >= 5
      and c.scheduled_at is null
      and c.artwork_kept_at is null
      and coalesce(coalesce(c.publish_on, c.due_on)::timestamptz, c.approved_at) < now() - make_interval(days => cp.artwork_keep_days)
      and creative_has_artwork(c.id)
      and (p_agency_id is null or c.agency_id = p_agency_id)
  loop
    v_keys := v_keys || strip_creative_artwork(r.id);
  end loop;

  insert into notifications (agency_id, user_id, kind, creative_id)
  select c.agency_id, m.user_id, 'artwork_removal', c.id
  from creatives c
  join projects p on p.id = c.project_id
  left join client_preferences cp on cp.client_id = p.client_id
  join memberships m on m.agency_id = c.agency_id
    and m.client_id is null and m.removed_at is null and m.accepted_at is not null
    and m.role in ('primary_owner', 'owner', 'admin')
  where c.stage >= 5
    and c.scheduled_at is null
    and c.artwork_kept_at is null
    and coalesce(cp.undated_artwork, 'ask') = 'ask'
    and coalesce(coalesce(c.publish_on, c.due_on)::timestamptz, c.approved_at) < now() - make_interval(days => coalesce(cp.artwork_keep_days, 7))
    and creative_has_artwork(c.id)
    and (p_agency_id is null or c.agency_id = p_agency_id)
  on conflict (user_id, kind, creative_id) where kind = 'artwork_removal' do nothing;

  return v_keys;
end;
$$;
revoke execute on function run_artwork_housekeeping(uuid) from public, anon, authenticated;

-- 4. A review link's feed (phase102's), newest Publish Date first.
create or replace function get_shared_review_feed(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
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
    and (coalesce(v_others, true) or cr.id = any(v_allowed_ids));

  return jsonb_build_object('status', 'ok', 'feed', v_feed);
end;
$$;
grant execute on function get_shared_review_feed(text, text) to anon, authenticated;

-- 5. Every project's Main Table back to the new default (decided directly:
--    saved arrangements replaced). No saved order: the built-in one. Hidden
--    by default: a Content Planner's Alt Text and Team; Other Content's
--    Slides, VO, Notes for Designer, Text on Image, Caption/Copy, Alt Text,
--    WIIFM Direction and Principles. Renamed columns and saved table views
--    are left as they are.
update projects set
  default_column_order = null,
  default_hidden_columns = case delivery
    when 'scheduled' then array['altText', 'lead']
    else array['slides', 'voiceover', 'notes', 'imageOnText', 'copy', 'altText', 'approach', 'principles']
  end;
