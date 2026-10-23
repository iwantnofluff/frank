-- Phase 117 — Notes for Designer in versions, as captions are.
--
-- Decided directly (23 Oct 2026): a post's Notes for Designer (its overall
-- note and one per slide, phase112) are kept as V1, V2 and so on. Save to
-- V{n} changes the latest version, Save as V{n+1} starts a new one; notes
-- have no comments, so both are always offered. The team's only, as before.
-- Each post's notes as they stand become its V1.
--
-- designer_notes stays for now, mirrored into the latest version by a
-- trigger, so notes saved from the previous release while this is rolling
-- out aren't lost. It goes in a later phase (docs/parity-gaps.md).

create table designer_note_versions (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  version_no integer not null check (version_no >= 1),
  overall text not null default '' check (char_length(overall) <= 20000),
  slides text[] not null default '{}',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_by uuid references users (id) on delete set null,
  edited_at timestamptz,
  unique (creative_id, version_no)
);

create trigger designer_note_versions_set_agency_id
  before insert or update of creative_id on designer_note_versions
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on designer_note_versions
  for each row execute function block_writes_when_read_only();

alter table designer_note_versions enable row level security;
create policy designer_note_versions_select on designer_note_versions
  for select using (can_see_creative_as_staff(creative_id));
create policy designer_note_versions_insert on designer_note_versions
  for insert with check (can_see_creative_as_staff(creative_id) and created_by = auth.uid());
-- No update or delete policy: the latest version changes only through
-- update_designer_note_version, which says why when it can't.

create or replace function update_designer_note_version(p_version_id uuid, p_overall text, p_slides text[])
returns timestamptz
language plpgsql security definer set search_path = public, extensions as $$
declare
  v designer_note_versions;
  v_at timestamptz := now();
begin
  select * into v from designer_note_versions where id = p_version_id for update;
  if not found then
    raise exception 'This version no longer exists';
  end if;
  if not can_see_creative_as_staff(v.creative_id) then
    raise exception 'Only the team can change the Notes for Designer';
  end if;
  if exists (select 1 from designer_note_versions where creative_id = v.creative_id and version_no > v.version_no) then
    raise exception 'Only the latest version can be changed';
  end if;
  update designer_note_versions
  set overall = coalesce(p_overall, ''), slides = coalesce(p_slides, '{}'), edited_at = v_at, edited_by = auth.uid()
  where id = v.id;
  return v_at;
end;
$$;

revoke all on function update_designer_note_version(uuid, text, text[]) from public, anon;
grant execute on function update_designer_note_version(uuid, text, text[]) to authenticated;

-- Each post's notes as they stand, as its V1.
insert into designer_note_versions (creative_id, agency_id, version_no, overall, slides, created_by, created_at)
select n.creative_id, n.agency_id, 1, n.overall, n.slides, n.updated_by, n.updated_at
from designer_notes n
where btrim(n.overall) <> '' or exists (select 1 from unnest(n.slides) s where btrim(s) <> '');

-- The previous release still saves to designer_notes: into the latest
-- version (or a first one), until it's gone.
create or replace function designer_notes_to_versions() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  select id into v_id from designer_note_versions
  where creative_id = new.creative_id order by version_no desc limit 1;
  if v_id is null then
    insert into designer_note_versions (creative_id, agency_id, version_no, overall, slides, created_by, created_at)
    values (new.creative_id, new.agency_id, 1, new.overall, new.slides, new.updated_by, new.updated_at);
  else
    update designer_note_versions
    set overall = new.overall, slides = new.slides, edited_at = new.updated_at, edited_by = new.updated_by
    where id = v_id;
  end if;
  return new;
end;
$$;
create trigger designer_notes_to_versions
  after insert or update on designer_notes
  for each row execute function designer_notes_to_versions();

-- So the API sees the new table straight away.
notify pgrst, 'reload schema';
