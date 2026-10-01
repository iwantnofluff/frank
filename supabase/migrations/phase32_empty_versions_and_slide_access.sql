-- Phase 32 — two carousel follow-ups.
--
-- 1. An artwork version with no images. Per direct instruction, removing
--    every slide and saving has to be possible. A version is the whole set
--    (phase31), so an empty set is saved as a version like any other: V2
--    with nothing in it, and the post shows "No artwork yet" while V1 and
--    its comments stay in the history. creative_versions.asset_id (which
--    holds slide 1) is therefore no longer required.
alter table creative_versions alter column asset_id drop not null;

-- 2. Clients can see every slide, not just the first. assets_select let a
--    client member read a file only when it's a version's asset_id — which
--    for a carousel is slide 1 — so slides 2 onwards came back empty for
--    them (checked with a real client session). Same policy as phase28,
--    with one more branch for a carousel slide.
drop policy assets_select on assets;
create policy assets_select on assets
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or exists (
        select 1 from creative_versions
        join creatives on creatives.id = creative_versions.creative_id
        join projects on projects.id = creatives.project_id
        where creative_versions.asset_id = assets.id
          and projects.client_id in (select current_client_ids(assets.agency_id))
      )
      or exists (
        select 1 from creative_version_slides s
        join creative_versions cv on cv.id = s.creative_version_id
        join creatives on creatives.id = cv.creative_id
        join projects on projects.id = creatives.project_id
        where s.asset_id = assets.id
          and projects.client_id in (select current_client_ids(assets.agency_id))
      )
      or exists (
        select 1 from clients
        where clients.logo_asset_id = assets.id
          and clients.id in (select current_client_ids(assets.agency_id))
      )
      or exists (
        select 1 from knowledge_entries
        where knowledge_entries.asset_id = assets.id
          and knowledge_entries.client_id in (select current_client_ids(assets.agency_id))
      )
      or exists (select 1 from users where users.avatar_asset_id = assets.id)
      or exists (
        select 1 from agency_settings
        where agency_settings.logo_asset_id = assets.id
          and agency_settings.agency_id = assets.agency_id
      )
    )
  );
