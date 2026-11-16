-- Phase 161 — comments record the VO and Text on Image versions too.
--
-- Decided directly (16 Nov 2026): beside the Creative and Copy versions,
-- the post page offers the VO's and Text on Image's versions (the team's
-- only, while the placeholder shows their words), and a comment records
-- the ones showing when it's made, shows its V and brings that version
-- back up when picked. Deleting a version (phase158) leaves its comments,
-- without the version.
--
-- Past comments on the VO's or Text on Image's words are given the version
-- of that field that was newest when they were posted, by date, as
-- phase160 did for the artwork and copy. None of the comments triggers
-- fire on these columns, and the read-only guard lets a migration through.

alter table comments
  add column voiceover_version_id uuid references production_versions (id) on delete set null,
  add column slide_text_version_id uuid references production_versions (id) on delete set null;

update comments c
set voiceover_version_id = (
  select pv.id from production_versions pv
  where pv.creative_id = c.creative_id and pv.field = 'voiceover' and pv.created_at <= c.created_at
  order by pv.version_no desc
  limit 1
)
where c.parent_id is null
  and c.anchor ->> 'type' = 'highlight'
  and c.anchor ->> 'field' = 'voiceover';

update comments c
set slide_text_version_id = (
  select pv.id from production_versions pv
  where pv.creative_id = c.creative_id and pv.field = 'slide_text' and pv.created_at <= c.created_at
  order by pv.version_no desc
  limit 1
)
where c.parent_id is null
  and c.anchor ->> 'type' = 'highlight'
  and c.anchor ->> 'field' = 'slide_text';

notify pgrst, 'reload schema';
