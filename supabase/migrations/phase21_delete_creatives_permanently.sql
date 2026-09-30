-- Permanent (hard) delete for one or more creatives — distinct from the
-- existing archived_at "delete" (useArchiveCreatives), which stays fully
-- reversible. This one really removes the row and everything under it:
-- comments, copy_versions, creative_versions, and any shared_links row
-- that pointed at it directly (scope = 'one'). A scope = 'pick' link's
-- own picked_creatives array isn't a foreign key — a stale id left in
-- there after this runs is harmless, shared_link_allowed_creative_ids()
-- simply won't find a matching creatives row for it any more.
--
-- comments and copy_versions cross-reference each other in both
-- directions (comments.copy_version_id/creative_version_id one way,
-- copy_versions.source_comment_id the other), so neither table can be
-- deleted first without breaking the other's still-live foreign key.
-- Nulling both sides out before deleting either avoids that without
-- reordering per-row.
--
-- Underlying `assets` rows (the actual uploaded files) are deliberately
-- left alone here, same as everywhere else in this schema — this
-- codebase already has a known, separate gap where archived/removed rows
-- don't sweep their storage objects (docs/parity-gaps.md), and closing
-- that is a different piece of work, not part of what was asked here.

create or replace function delete_creatives_permanently(p_creative_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_agency_id uuid;
begin
  if p_creative_ids is null or array_length(p_creative_ids, 1) is null then
    return;
  end if;

  select agency_id into v_agency_id
  from creatives
  where id = any(p_creative_ids)
  limit 1;

  if v_agency_id is null then
    raise exception 'no matching creatives found';
  end if;

  if not is_agency_staff(v_agency_id) then
    raise exception 'not permitted';
  end if;

  if exists (
    select 1 from creatives
    where id = any(p_creative_ids) and agency_id <> v_agency_id
  ) then
    raise exception 'creatives span more than one agency';
  end if;

  update comments set copy_version_id = null, creative_version_id = null
  where creative_id = any(p_creative_ids);
  update copy_versions set source_comment_id = null
  where creative_id = any(p_creative_ids);

  delete from comments where creative_id = any(p_creative_ids);
  delete from copy_versions where creative_id = any(p_creative_ids);
  delete from creative_versions where creative_id = any(p_creative_ids);
  delete from shared_links where creative_id = any(p_creative_ids);
  delete from creatives where id = any(p_creative_ids);
end;
$$;

grant execute on function delete_creatives_permanently(uuid[]) to authenticated;
