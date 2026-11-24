-- Phase 165 — existing posts keep their size as the defaults change.
--
-- Decided directly (24 Nov 2026), from the user's Instagram guide: an
-- Instagram Post or Carousel now defaults to 1080×1440 (3:4), and a Meta
-- Feed or Carousel Ad to 1080×1350 (4:5; 3:4 can't be promoted). A post
-- stores a size only where it isn't its format's default (lib/formats.ts),
-- so every existing post on the old default would quietly change shape.
-- This writes the old default into those posts' sizes: Instagram Post and
-- Carousel 1080×1350, Meta Feed and Carousel Ad 1080×1080. A size already
-- chosen is left alone; new posts take the new defaults.

-- Not an edit anyone made: each post's Last Activity stays
-- (frank.quiet_status, as phase151's restatus does). For this transaction.
select set_config('frank.quiet_status', 'on', true);

update creatives cr
set sizes = coalesce(cr.sizes, '{}'::jsonb) || (
  select coalesce(jsonb_object_agg(f, case when f in ('ig_feed', 'ig_carousel')
      then jsonb_build_object('w', 1080, 'h', 1350)
      else jsonb_build_object('w', 1080, 'h', 1080) end), '{}'::jsonb)
  from unnest(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end) f
  where f in ('ig_feed', 'ig_carousel', 'meta_feed', 'meta_carousel')
    and not (coalesce(cr.sizes, '{}'::jsonb) ? f)
)
where exists (
  select 1 from unnest(case when cardinality(cr.formats) > 0 then cr.formats else array[cr.format] end) f
  where f in ('ig_feed', 'ig_carousel', 'meta_feed', 'meta_carousel')
    and not (coalesce(cr.sizes, '{}'::jsonb) ? f)
);

select set_config('frank.quiet_status', '', true);
