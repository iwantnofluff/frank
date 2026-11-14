-- Phase 158 — deleting a VO, Text on Image or Thumbnail Text on Image
-- version.
--
-- Decided directly (14 Nov 2026): their versions get the small × the
-- copy's have (phase30), working the same way. They carry no comments
-- (phase120), so any can go. Deleting the latest puts the one before it
-- back on the post (creatives.voiceover, slide_text, thumbnail_text, which
-- everything else reads), or empties it when it was the only one. The row
-- goes first, so creatives_production_to_versions (phase120) finds the
-- post's words already matching the new latest and leaves it be. The
-- team's only, as saving is.

create or replace function delete_production_version(p_version_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v production_versions;
  v_latest_id uuid;
  v_next production_versions;
begin
  select * into v from production_versions where id = p_version_id;
  if not found then
    raise exception 'version not found';
  end if;
  if not can_see_creative_as_staff(v.creative_id) then
    raise exception 'not permitted';
  end if;
  perform 1 from creatives where id = v.creative_id for update;

  select id into v_latest_id from production_versions
  where creative_id = v.creative_id and field = v.field
  order by version_no desc limit 1;

  delete from production_versions where id = p_version_id;

  -- The latest gone: the post takes the one before it, or nothing.
  if v_latest_id = p_version_id then
    select * into v_next from production_versions
    where creative_id = v.creative_id and field = v.field
    order by version_no desc limit 1;
    if v.field = 'voiceover' then
      update creatives set voiceover = v_next.body where id = v.creative_id;
    elsif v.field = 'thumbnail_text' then
      update creatives set thumbnail_text = v_next.body where id = v.creative_id;
    else
      update creatives set slide_text = coalesce(v_next.slides, '{}') where id = v.creative_id;
    end if;
  end if;
end;
$$;

revoke all on function delete_production_version(uuid) from public, anon;
grant execute on function delete_production_version(uuid) to authenticated;

notify pgrst, 'reload schema';
