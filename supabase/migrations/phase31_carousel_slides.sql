-- Phase 31 — carousels.
--
-- Decided directly: a carousel post has a slide count (2–20; the app caps
-- Meta Carousel Ad at 10), and an artwork version is the whole set of
-- slides — V2 is a new full set, and replacing one slide saves a new
-- version that carries the others over. LinkedIn Carousel (Document) works
-- the same way, with images rather than a PDF.
--
-- creative_versions.asset_id stays, and for a carousel it holds slide 1.
-- So everything that shows a version's artwork — thumbnails, the feed, the
-- shared-review RPC — keeps working, showing the first slide. The full
-- ordered set is in creative_version_slides. A non-carousel version has
-- no slide rows.
--
-- A pin or box placed on a slide records which slide in its own anchor
-- (comments.anchor is jsonb: { ..., "slide": 2 }), so that needs no
-- schema change.

alter table creatives
  add column slide_count int check (slide_count between 2 and 20);

create table creative_version_slides (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_version_id uuid not null references creative_versions (id) on delete cascade,
  position int not null check (position >= 1),
  asset_id uuid not null references assets (id),
  created_at timestamptz not null default now(),
  unique (creative_version_id, position)
);

-- agency_id from the parent version, never from the client — same as
-- every other child table.
create or replace function set_agency_id_from_creative_version()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  select agency_id into new.agency_id from creative_versions where id = new.creative_version_id;
  return new;
end;
$$;

create trigger creative_version_slides_set_agency_id
  before insert on creative_version_slides
  for each row execute function set_agency_id_from_creative_version();

alter table creative_version_slides enable row level security;

-- Readable by whoever can read the version itself.
create policy creative_version_slides_select on creative_version_slides
  for select using (
    agency_id in (select current_agency_ids())
    and exists (
      select 1 from creative_versions cv
      join creatives c on c.id = cv.creative_id
      join projects p on p.id = c.project_id
      where cv.id = creative_version_slides.creative_version_id
        and p.client_id in (select visible_client_ids(creative_version_slides.agency_id))
    )
  );

-- Written by whoever can upload a version for the post's client (the
-- creative_versions_insert rule, phase23c).
create policy creative_version_slides_insert on creative_version_slides
  for insert with check (
    exists (
      select 1 from creative_versions cv
      join creatives c on c.id = cv.creative_id
      join projects p on p.id = c.project_id
      where cv.id = creative_version_slides.creative_version_id
        and p.client_id in (select staff_visible_client_ids(creative_version_slides.agency_id))
    )
  );
