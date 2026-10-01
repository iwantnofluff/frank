-- Phase 33 — removing a post's artwork when its format changes.
--
-- Decided directly: when a post's format changes in a way its uploaded
-- artwork no longer fits (carousel to single or back, image to video or
-- back, a different shape, fewer carousel slides than were uploaded), the
-- person is warned, and confirming deletes every artwork version for good —
-- the versions, their slides, the files, and the comments placed on them
-- (with their replies). Copy and its versions are untouched.
--
-- SECURITY DEFINER with its own check, the same shape as
-- delete_creatives_permanently (phase21) and delete_post_version (phase30):
-- anyone who can upload artwork for the post's client. It returns the
-- storage paths of the files it freed — files nothing else still points at
-- — so /api/creatives/[id]/clear-artwork can remove them from storage with
-- the service role (no signed-in role can delete storage objects).

create or replace function delete_creative_artwork(p_creative_id uuid)
returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency_id uuid;
  v_client_id uuid;
  v_assets uuid[];
  v_keys text[];
begin
  select c.agency_id, p.client_id into v_agency_id, v_client_id
  from creatives c join projects p on p.id = c.project_id
  where c.id = p_creative_id;

  if v_agency_id is null then
    raise exception 'post not found';
  end if;
  if v_client_id not in (select staff_visible_client_ids(v_agency_id)) then
    raise exception 'not permitted';
  end if;

  -- Every file the artwork used: each version's main file and its slides.
  select array_agg(distinct a) into v_assets from (
    select cv.asset_id as a from creative_versions cv
    where cv.creative_id = p_creative_id and cv.asset_id is not null
    union
    select s.asset_id from creative_version_slides s
    join creative_versions cv on cv.id = s.creative_version_id
    where cv.creative_id = p_creative_id
  ) x;

  -- Comments on those versions, and every reply under them.
  create temporary table doomed_comments on commit drop as
  with recursive t(id) as (
    select id from comments
    where creative_version_id in (select id from creative_versions where creative_id = p_creative_id)
    union
    select c.id from comments c join t on c.parent_id = t.id
  )
  select id from t;

  update copy_versions set source_comment_id = null
  where source_comment_id in (select id from doomed_comments);
  delete from comments where id in (select id from doomed_comments);

  -- Slides go with their versions (on delete cascade).
  delete from creative_versions where creative_id = p_creative_id;

  -- Files nothing else still uses: their rows go, and their paths are
  -- returned for storage.
  with freed as (
    delete from assets a
    where a.id = any(coalesce(v_assets, '{}'))
      and not exists (select 1 from creative_versions cv where cv.asset_id = a.id)
      and not exists (select 1 from creative_version_slides s where s.asset_id = a.id)
      and not exists (select 1 from knowledge_entries k where k.asset_id = a.id)
      and not exists (select 1 from clients cl where cl.logo_asset_id = a.id)
      and not exists (select 1 from users u where u.avatar_asset_id = a.id)
      and not exists (select 1 from agency_settings st where st.logo_asset_id = a.id)
    returning a.storage_key
  )
  select coalesce(array_agg(storage_key), '{}') into v_keys from freed;

  return v_keys;
end;
$$;

grant execute on function delete_creative_artwork(uuid) to authenticated;
