-- Phase 28 — saved colour presets, and an agency logo clients can see.
--
-- 1. agency_settings.custom_presets — the Branding page's "Save current as
--    preset" (per direct instruction, matching the prototype): a name ->
--    colours map, e.g. {"Autumn": {"action": "#C2410C", "rail": ...}}.
--    agency_settings.theme itself needs no change: it's jsonb, and the two
--    keys the prototype has beyond the original default (hl, private) are
--    simply written into it.
--
-- 2. assets_select gains a branch for the agency's own logo
--    (agency_settings.logo_asset_id, which already existed). Per direct
--    instruction the logo shows to clients too; staff could already see
--    every asset, but a client-side member could only see their own
--    client's files. Otherwise identical to phase26's version.

alter table agency_settings add column custom_presets jsonb not null default '{}'::jsonb;

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
