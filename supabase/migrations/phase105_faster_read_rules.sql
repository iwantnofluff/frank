-- Phase 105 — faster read rules.
--
-- Reported directly (16 Oct 2026): pages slow, requests failing. Measured
-- on live: a post's versions took 68ms on average as a signed-in person
-- (6.9s at worst, near the 8s statement limit) against under 1ms without
-- the rules. Each read rule called its helper with the row's own agency
-- (visible_project_ids(creative_versions.agency_id)), so the helper, and
-- in_request_agency's header check inside it, ran again for every row,
-- and the rules on a post's children re-ran the post's and project's own
-- rules inside them.
--
-- Here each helper runs once per query instead: the same sets, taken over
-- every agency the person is in (current_agency_ids), and each row is
-- checked against them. Who can see what doesn't change. Checked before
-- this was written, read-only on live: for all 14 active people, every
-- table below gave exactly the same rows under the old rule and this one
-- (140 checks, no difference), and No Fluff's ran 10-30 times faster
-- (posts 183ms to 7ms, copy 165ms to 7ms, versions 98ms to 7ms).
--
-- A row's agency is always one of the person's (each rule still says so),
-- and its project's agency is its own (set by trigger), so a set over all
-- their agencies matches the old per-agency one exactly.

-- 1. The sets, once per query. Security definer, as the helpers they
--    gather are, so a rule's set isn't itself filtered by other rules.
create or replace function my_visible_project_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select visible_project_ids(a) from current_agency_ids() a;
$$;

create or replace function my_staff_visible_project_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select staff_visible_project_ids(a) from current_agency_ids() a;
$$;

create or replace function my_client_project_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select client_project_ids(a) from current_agency_ids() a;
$$;

create or replace function my_assigned_project_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select my_project_ids(a) from current_agency_ids() a;
$$;

create or replace function my_visible_client_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select visible_client_ids(a) from current_agency_ids() a;
$$;

create or replace function my_client_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select current_client_ids(a) from current_agency_ids() a;
$$;

-- The agencies where they're Admin or above (is_unrestricted_staff), and
-- where they're on the team at all (is_agency_staff).
create or replace function my_unrestricted_agency_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select a from current_agency_ids() a where is_unrestricted_staff(a);
$$;

create or replace function my_staff_agency_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select a from current_agency_ids() a where is_agency_staff(a);
$$;

-- The posts in those projects.
create or replace function my_visible_creative_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select c.id from creatives c where c.project_id in (select my_visible_project_ids());
$$;

create or replace function my_staff_creative_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select c.id from creatives c where c.project_id in (select my_staff_visible_project_ids());
$$;

create or replace function my_client_creative_ids()
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select c.id from creatives c where c.project_id in (select my_client_project_ids());
$$;

-- 2. The read rules, each the same test against the sets above.
alter policy creatives_select on creatives using (
  agency_id in (select current_agency_ids())
  and project_id in (select my_visible_project_ids())
);

alter policy creative_versions_select on creative_versions using (
  agency_id in (select current_agency_ids())
  and creative_id in (select my_visible_creative_ids())
);

alter policy copy_versions_select on copy_versions using (
  agency_id in (select current_agency_ids())
  and creative_id in (select my_visible_creative_ids())
);

alter policy creative_version_slides_select on creative_version_slides using (
  agency_id in (select current_agency_ids())
  and creative_version_id in (
    select v.id from creative_versions v where v.creative_id in (select my_visible_creative_ids())
  )
);

-- Staff see every comment on their posts; a client's people only public
-- ones on theirs (comments_enforce_visibility is unchanged).
alter policy comments_select on comments using (
  agency_id in (select current_agency_ids())
  and (
    creative_id in (select my_staff_creative_ids())
    or (visibility = 'public' and creative_id in (select my_client_creative_ids()))
  )
);

alter policy projects_select on projects using (
  agency_id in (select current_agency_ids())
  and client_id in (select my_visible_client_ids())
  and (agency_id in (select my_unrestricted_agency_ids()) or id in (select my_assigned_project_ids()))
);

alter policy clients_select on clients using (
  agency_id in (select current_agency_ids())
  and (agency_id in (select my_unrestricted_agency_ids()) or id in (select my_visible_client_ids()))
);

alter policy knowledge_entries_select on knowledge_entries using (
  agency_id in (select current_agency_ids())
  and client_id in (select my_visible_client_ids())
);

alter policy project_roles_select on project_roles using (
  project_id in (select my_visible_project_ids())
);

-- A file: anyone on the team; a client's people, their posts' artwork and
-- slides, their client's logo and Knowledge; anyone, a person's photo or
-- the agency's logo (as before).
alter policy assets_select on assets using (
  agency_id in (select current_agency_ids())
  and (
    agency_id in (select my_staff_agency_ids())
    or id in (select v.asset_id from creative_versions v where v.creative_id in (select my_client_creative_ids()))
    or id in (
      select s.asset_id from creative_version_slides s
      join creative_versions cv on cv.id = s.creative_version_id
      where cv.creative_id in (select my_client_creative_ids())
    )
    or id in (select cl.logo_asset_id from clients cl where cl.id in (select my_client_ids()))
    or id in (select k.asset_id from knowledge_entries k where k.client_id in (select my_client_ids()))
    or exists (select 1 from users where users.avatar_asset_id = assets.id)
    or exists (
      select 1 from agency_settings
      where agency_settings.logo_asset_id = assets.id and agency_settings.agency_id = assets.agency_id
    )
  )
);
