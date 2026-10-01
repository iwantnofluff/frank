-- Phase 30 — delete a single creative or copy version.
--
-- Decided directly: any agency staff who can upload versions for the
-- post's client can delete one, and only a version nobody has commented
-- on — feedback is never lost or orphaned by a delete. Clients can't.
--
-- Neither version table has a delete policy, and this doesn't add one:
-- the comment check has to happen in the same statement as the delete,
-- so it's a SECURITY DEFINER function that does its own access check,
-- the same shape as delete_creatives_permanently (phase21).
--
-- A soft-deleted comment (deleted_at set) doesn't count — nobody can see
-- it — but it still holds a foreign key to the version, so its link is
-- cleared first. The uploaded file's `assets` row is left in place, the
-- same known storage-sweep gap phase21 records.
--
-- Version numbers aren't renumbered: deleting V2 of V1–V3 leaves V1 and
-- V3, and the next upload is V4. Deleting the latest frees its number for
-- the next one (nothing pointed at it — it had no comments).

create or replace function delete_post_version(p_kind text, p_version_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_agency_id uuid;
  v_client_id uuid;
begin
  if p_kind = 'creative' then
    select cv.agency_id, p.client_id into v_agency_id, v_client_id
    from creative_versions cv
    join creatives c on c.id = cv.creative_id
    join projects p on p.id = c.project_id
    where cv.id = p_version_id;
  elsif p_kind = 'copy' then
    select cpv.agency_id, p.client_id into v_agency_id, v_client_id
    from copy_versions cpv
    join creatives c on c.id = cpv.creative_id
    join projects p on p.id = c.project_id
    where cpv.id = p_version_id;
  else
    raise exception 'unknown version kind';
  end if;

  if v_agency_id is null then
    raise exception 'version not found';
  end if;

  if v_client_id not in (select staff_visible_client_ids(v_agency_id)) then
    raise exception 'not permitted';
  end if;

  if exists (
    select 1 from comments
    where deleted_at is null
      and (case when p_kind = 'creative' then creative_version_id else copy_version_id end) = p_version_id
  ) then
    raise exception 'this version has comments';
  end if;

  if p_kind = 'creative' then
    update comments set creative_version_id = null where creative_version_id = p_version_id;
    delete from creative_versions where id = p_version_id;
  else
    update comments set copy_version_id = null where copy_version_id = p_version_id;
    delete from copy_versions where id = p_version_id;
  end if;
end;
$$;

grant execute on function delete_post_version(text, uuid) to authenticated;
