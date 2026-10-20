-- Phase 110 — Design with Frank: a design direction for a post.
--
-- Decided directly (20 Oct 2026): Frank reads a post's concept, formats
-- and reference links (their images, and the likes and comments a public
-- Instagram post shows), with the client's knowledge, strategy and
-- feedback, and writes the designer a direction: what the references
-- teach, two or three ways to design this post (stills and Reels), and
-- guardrails. Each run is one AI request against the monthly cap (through
-- runAiTask), and is kept with the post. Staff only: a Client never sees
-- them.

create table design_directions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_id uuid not null references creatives (id) on delete cascade,
  -- Frank's direction, as read back from its reply.
  body jsonb not null,
  -- The references as Frank read them: address, title, image, and
  -- whether anything could be read.
  refs jsonb not null default '[]'::jsonb,
  -- The direction the team chose with Use This, by position.
  chosen int,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index design_directions_creative_idx on design_directions (creative_id, created_at desc);
create trigger design_directions_set_agency_id
  before insert or update of creative_id on design_directions
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on design_directions
  for each row execute function block_writes_when_read_only();

alter table design_directions enable row level security;
create policy design_directions_select on design_directions
  for select using (can_see_creative_as_staff(creative_id));
create policy design_directions_insert on design_directions
  for insert with check (can_see_creative_as_staff(creative_id) and created_by = auth.uid());
create policy design_directions_update on design_directions
  for update using (can_see_creative_as_staff(creative_id));
