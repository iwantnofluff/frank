-- Phase 57 — Text on Image belongs to the post, not to copy versions.
--
-- Decided directly (5 Oct 2026): copy versions are the caption and the
-- formats' copy fields only. Text on Image is saved on the post with its
-- own Save button, so a V1 never exists without copy. Versions that hold
-- no copy (made by Text on Image alone) are removed, once their Text on
-- Image is on the post, and the rest renumbered from V1.

-- 1. Text on Image on the post, one entry per slide.
alter table creatives
  add column slide_text text[] not null default '{}';

-- 2. Each post's latest Text on Image, from its versions.
update creatives c
set slide_text = v.slide_text
from (
  select distinct on (creative_id) creative_id, slide_text
  from copy_versions
  where coalesce(array_length(slide_text, 1), 0) > 0
  order by creative_id, version_no desc
) v
where v.creative_id = c.id;

-- 3. Versions with no copy in them, and nothing pointing at them.
delete from copy_versions cv
where not exists (
    select 1 from jsonb_each_text(coalesce(cv.fields, '{}'::jsonb)) f where btrim(f.value) <> ''
  )
  and not exists (select 1 from comments cm where cm.copy_version_id = cv.id);

-- 4. Renumbered from V1 per post, in order (via negatives, so the
--    (creative_id, version_no) uniqueness holds throughout).
with ranked as (
  select id, row_number() over (partition by creative_id order by version_no) as n
  from copy_versions
)
update copy_versions cv set version_no = -r.n from ranked r where r.id = cv.id;
update copy_versions set version_no = -version_no where version_no < 0;

-- 5. From now on, a copy version needs some copy.
create or replace function copy_versions_need_copy()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if not exists (
    select 1 from jsonb_each_text(coalesce(new.fields, '{}'::jsonb)) f where btrim(f.value) <> ''
  ) then
    raise exception 'A copy version needs some copy' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger copy_versions_need_copy
  before insert on copy_versions
  for each row execute function copy_versions_need_copy();
