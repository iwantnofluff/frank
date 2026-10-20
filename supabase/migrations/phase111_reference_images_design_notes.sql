-- Phase 111 — pasted reference images, and the post's Design Direction.
--
-- Decided directly (20 Oct 2026): References on a post's Brief take
-- pasted or dropped images as well as links, for the team working on the
-- post (never a Client), and Design with Frank reads them. And the Brief
-- has a Design Direction box: Use This fills it, the team edits it, and
-- Update saves it. Team only, as the directions themselves are.

-- A pasted reference image: the file is an ordinary asset (uploaded as a
-- Knowledge file is, so the storage limit applies), linked to its post
-- here. assets_select already keeps it from a Client: it's in no version,
-- slide, logo or Knowledge entry of theirs.
create table reference_images (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_id uuid not null references creatives (id) on delete cascade,
  asset_id uuid not null references assets (id) on delete cascade,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index reference_images_creative_idx on reference_images (creative_id, created_at);
create trigger reference_images_set_agency_id
  before insert or update of creative_id on reference_images
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on reference_images
  for each row execute function block_writes_when_read_only();

alter table reference_images enable row level security;
create policy reference_images_select on reference_images
  for select using (can_see_creative_as_staff(creative_id));
create policy reference_images_insert on reference_images
  for insert with check (can_see_creative_as_staff(creative_id) and created_by = auth.uid());
create policy reference_images_delete on reference_images
  for delete using (can_see_creative_as_staff(creative_id));

-- The post's Design Direction, as the team saved it: one per post.
create table design_direction_notes (
  creative_id uuid primary key references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  body text not null check (char_length(body) <= 20000),
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger design_direction_notes_set_agency_id
  before insert or update of creative_id on design_direction_notes
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on design_direction_notes
  for each row execute function block_writes_when_read_only();

alter table design_direction_notes enable row level security;
create policy design_direction_notes_select on design_direction_notes
  for select using (can_see_creative_as_staff(creative_id));
create policy design_direction_notes_insert on design_direction_notes
  for insert with check (can_see_creative_as_staff(creative_id) and updated_by = auth.uid());
create policy design_direction_notes_update on design_direction_notes
  for update using (can_see_creative_as_staff(creative_id)) with check (updated_by = auth.uid());
create policy design_direction_notes_delete on design_direction_notes
  for delete using (can_see_creative_as_staff(creative_id));
