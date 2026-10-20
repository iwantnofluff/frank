-- Phase 112 — Notes for Designer, the team's only.
--
-- Decided directly (20 Oct 2026): Design with Frank's direction goes into
-- Notes for Designer (no separate Design Direction box), and Notes for
-- Designer becomes the team's only: an instruction to the designer, not
-- something the client signs off, and Frank's guardrails can quote the
-- client's own feedback. A post's row is readable by its Client, so the
-- notes move off it into their own table, which only the team can read.
--
-- The post's overall note was creatives.cx->'designer_notes', each image's
-- creatives.slide_notes (phase108); phase111's Design Direction box was
-- design_direction_notes. All three move here, and are cleared from the
-- post. creatives.slide_notes stays, empty, until the app no longer reads
-- it anywhere; a later migration drops it.

create table designer_notes (
  creative_id uuid primary key references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  -- The post's overall note.
  overall text not null default '' check (char_length(overall) <= 20000),
  -- One per image on a multi-image post, in order.
  slides text[] not null default '{}',
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger designer_notes_set_agency_id
  before insert or update of creative_id on designer_notes
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on designer_notes
  for each row execute function block_writes_when_read_only();

alter table designer_notes enable row level security;
create policy designer_notes_select on designer_notes
  for select using (can_see_creative_as_staff(creative_id));
create policy designer_notes_insert on designer_notes
  for insert with check (can_see_creative_as_staff(creative_id) and updated_by = auth.uid());
create policy designer_notes_update on designer_notes
  for update using (can_see_creative_as_staff(creative_id)) with check (updated_by = auth.uid());

-- What's there now. The Design Direction box's text goes first, then the
-- note that was already on the post, a blank line between.
insert into designer_notes (creative_id, agency_id, overall, slides, updated_at)
select
  c.id,
  c.agency_id,
  concat_ws(
    e'\n\n',
    nullif(btrim(coalesce(d.body, '')), ''),
    nullif(btrim(coalesce(c.cx ->> 'designer_notes', '')), '')
  ),
  coalesce(c.slide_notes, '{}'),
  greatest(c.updated_at, d.updated_at)
from creatives c
left join design_direction_notes d on d.creative_id = c.id
where nullif(btrim(coalesce(c.cx ->> 'designer_notes', '')), '') is not null
   or nullif(btrim(coalesce(d.body, '')), '') is not null
   or exists (select 1 from unnest(coalesce(c.slide_notes, '{}')) n where btrim(n) <> '');

-- Off the post, where a Client could read them. Not stamped as a change to
-- the post (phase82), so nobody with one open is told someone changed it.
alter table creatives disable trigger creatives_stamp_update;
update creatives
set cx = cx - 'designer_notes'
where cx ? 'designer_notes';
update creatives
set slide_notes = '{}'
where slide_notes is not null and slide_notes <> '{}';
alter table creatives enable trigger creatives_stamp_update;

drop table design_direction_notes;
