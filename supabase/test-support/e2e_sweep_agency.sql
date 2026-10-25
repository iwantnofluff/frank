-- Test support, staging only: never applied to live, where no tests run.
--
-- Decided directly (25 Oct 2026): the e2e suite's teardown removed a test
-- workspace with about 50 separate deletes, each a round trip to staging,
-- about 8 seconds a test. This does the same deletes, in the same order as
-- tests/e2e/sweep.ts, in one call. It refuses anything but a test
-- workspace (named E2E Test Agency), and only the service role may call
-- it. Storage files aren't touched here; sweep.ts removes them after.
-- Returns how many assets rows went, so the caller knows to look for files.
-- Keep the table list in step with sweep.ts's fallback steps.

create or replace function e2e_sweep_agency(p_agency_id uuid)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t text;
  v_assets int;
begin
  if not exists (select 1 from agencies where id = p_agency_id and name = 'E2E Test Agency') then
    raise exception 'Not a test workspace: %', p_agency_id;
  end if;

  foreach t in array array[
    'shared_links', 'notifications', 'project_discussion', 'project_activity', 'comments',
    'copy_versions', 'creative_version_slides', 'creative_versions', 'thumbnail_versions',
    'designer_notes', 'proofreads', 'production_versions', 'designer_note_versions',
    'reference_images', 'design_directions', 'copy_chat_messages', 'copy_chats',
    'creative_stage_events', 'post_live_dates', 'creatives', 'custom_columns',
    'project_access', 'projects', 'format_directions', 'proofread_rules',
    'agency_knowledge_entries', 'knowledge_entries', 'client_monthly_strategies',
    'client_strategy_overviews', 'invites', 'staff_client_access', 'plan_requests',
    'agency_billing', 'memberships', 'calendar_views', 'client_contacts', 'project_folders',
    'instagram_connect_links', 'instagram_connections', 'client_preferences', 'clients',
    'agency_settings'
  ] loop
    execute format('delete from %I where agency_id = $1', t) using p_agency_id;
  end loop;

  -- A profile photo points at an asset: unlinked before the assets go.
  update users set avatar_asset_id = null
    where avatar_asset_id in (select id from assets where agency_id = p_agency_id);
  delete from assets where agency_id = p_agency_id;
  get diagnostics v_assets = row_count;

  delete from ai_usage_events where agency_id = p_agency_id;
  delete from plan_changes where agency_id = p_agency_id;
  delete from admin_actions where agency_id = p_agency_id;
  delete from agencies where id = p_agency_id;
  return v_assets;
end;
$$;

revoke all on function e2e_sweep_agency(uuid) from public, anon, authenticated;
grant execute on function e2e_sweep_agency(uuid) to service_role;

notify pgrst, 'reload schema';
