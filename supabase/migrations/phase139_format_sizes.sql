-- Phase 139 — a size for each of a post's formats.
--
-- Decided directly (3 Nov 2026): every format has a default size, and the
-- team can choose another for a post in the post window, under Format.
-- The review screen draws the post at that size's shape. A post can have
-- several formats, so the size is kept per format:
--   {"ig_feed": {"w": 1080, "h": 1350}, "li_image": {"w": 1200, "h": 1200}}
-- A format left out uses its default (lib/formats.ts). Who can change it
-- is whoever can change the post (creatives_update, phase46).

-- 1. Well formed: an object of {w, h}, whole numbers from 1 to 20000.
create or replace function format_sizes_valid(p_sizes jsonb)
returns boolean
language sql immutable set search_path = public, extensions as $$
  select jsonb_typeof(p_sizes) = 'object'
    and not exists (
      select 1 from jsonb_each(p_sizes) e
      where jsonb_typeof(e.value) is distinct from 'object'
         or jsonb_typeof(e.value -> 'w') is distinct from 'number'
         or jsonb_typeof(e.value -> 'h') is distinct from 'number'
         or (e.value ->> 'w')::numeric not between 1 and 20000
         or (e.value ->> 'h')::numeric not between 1 and 20000
         or (e.value ->> 'w')::numeric % 1 <> 0
         or (e.value ->> 'h')::numeric % 1 <> 0
    );
$$;

-- 2. The sizes.
alter table creatives add column if not exists sizes jsonb not null default '{}'::jsonb;
alter table creatives drop constraint if exists creatives_sizes_valid;
alter table creatives add constraint creatives_sizes_valid check (format_sizes_valid(sizes));
