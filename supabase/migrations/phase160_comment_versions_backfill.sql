-- Phase 160 — the versions past comments were made on, worked out.
--
-- Decided directly (14 Nov 2026): every comment shows the version it was
-- made on beside its Private or Public pill (1.90.1), but a plain comment
-- (no pin, area, highlighted words or video moment) recorded no version,
-- so most showed none. New ones now record the artwork and copy versions
-- showing when posted; this gives each past top-level comment that has
-- neither the artwork and copy versions that were newest when it was
-- posted, by date. Replies are left alone (their thread says it). A post
-- with no version yet at that time stays without one.
--
-- None of the comments triggers fire on these two columns, and the
-- read-only guard lets a migration through.

update comments c
set
  creative_version_id = (
    select cv.id from creative_versions cv
    where cv.creative_id = c.creative_id and cv.created_at <= c.created_at
    order by cv.version_no desc
    limit 1
  ),
  copy_version_id = (
    select pv.id from copy_versions pv
    where pv.creative_id = c.creative_id and pv.created_at <= c.created_at
    order by pv.version_no desc
    limit 1
  )
where c.parent_id is null
  and c.creative_version_id is null
  and c.copy_version_id is null;
