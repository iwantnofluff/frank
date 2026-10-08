-- Phase 69 — every review link includes every post in Client Review.
--
-- Decided directly (8 Oct 2026, option 1 of two): a post in Client Review
-- has been handed to the client, so any review link for its project shows
-- it, whatever the link's scope. The scope still adds what it chose on top:
-- 'all' adds Approved posts, 'one' and 'pick' add their chosen posts once
-- they reach Client Review or Approved. Nothing below Client Review is ever
-- included, as before (phase13).
--
-- This one function is what get_shared_review, the feed, comments and
-- approval all ask, so a visitor can now open, comment on and approve every
-- Client Review post through any of the project's links. The Share window
-- says so (lib/shared-link-eligibility.ts mirrors this).

create or replace function shared_link_allowed_creative_ids(v_link shared_links)
returns uuid[]
language sql security definer set search_path = public stable as $$
  select array_agg(id) from creatives
  where project_id = v_link.project_id
    and archived_at is null
    and stage >= 3
    and (
      stage = 3
      or case v_link.scope
        when 'all' then true
        when 'pending' then false
        when 'one' then id = v_link.creative_id
        when 'pick' then id = any(v_link.picked_creatives)
        else false
      end
    );
$$;
