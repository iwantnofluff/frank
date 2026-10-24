-- Phase 120 — the Production tab's words in versions.
--
-- Decided directly (24 Oct 2026): the VO, Text on Image and Thumbnail Text
-- on Image each have their own versions, as captions do: Save to V{n}
-- changes the latest, Save as V{n+1} adds one; they have no comments, so
-- both are always offered. The post keeps its latest words where they are
-- (creatives.voiceover, slide_text, thumbnail_text), so everything that
-- reads them (the table, review links, Checks, Draft with Frank) is
-- unchanged. The team's only, as the VO is. Each post's words as they
-- stand become V1.

create table production_versions (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  field text not null check (field in ('voiceover', 'slide_text', 'thumbnail_text')),
  version_no integer not null check (version_no >= 1),
  -- The VO or Thumbnail Text on Image; Text on Image's slides.
  body text,
  slides text[] not null default '{}',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_by uuid references users (id) on delete set null,
  edited_at timestamptz,
  unique (creative_id, field, version_no)
);

create trigger production_versions_set_agency_id
  before insert or update of creative_id on production_versions
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on production_versions
  for each row execute function block_writes_when_read_only();

alter table production_versions enable row level security;
create policy production_versions_select on production_versions
  for select using (can_see_creative_as_staff(creative_id));
-- Written only through save_production_version.

-- Saves one field: into its latest version ("current") or as the next
-- ("new"), only if the latest is still the one the window knew
-- (p_known_version_id, null when it knew none), and puts the words on the
-- post. Returns the saved version.
create or replace function save_production_version(
  p_creative_id uuid,
  p_field text,
  p_mode text,
  p_body text,
  p_slides text[],
  p_known_version_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_latest production_versions;
  v_saved production_versions;
  v_who text;
  -- As the post keeps them: trimmed, and none when empty.
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_slides text[] := coalesce(p_slides, '{}');
begin
  if auth.uid() is null then
    raise exception 'Sign in to save';
  end if;
  if p_field not in ('voiceover', 'slide_text', 'thumbnail_text') then
    raise exception 'Not a Production field';
  end if;
  if p_mode not in ('current', 'new') then
    raise exception 'Save to the current version or as a new one';
  end if;
  if not can_see_creative_as_staff(p_creative_id) then
    raise exception 'Only the team can change this';
  end if;
  perform 1 from creatives where id = p_creative_id for update;

  select * into v_latest from production_versions
  where creative_id = p_creative_id and field = p_field
  order by version_no desc limit 1;
  -- Someone else's save since this window opened: who, rather than over it.
  if v_latest.id is distinct from p_known_version_id then
    select coalesce(u.name, 'Someone') into v_who from users u
    where u.id = coalesce(v_latest.edited_by, v_latest.created_by);
    raise exception '% changed this while you had it open', coalesce(v_who, 'Someone') using errcode = 'P0409';
  end if;

  if p_mode = 'current' and v_latest.id is not null then
    update production_versions
    set body = v_body, slides = v_slides, edited_by = auth.uid(), edited_at = now()
    where id = v_latest.id
    returning * into v_saved;
  else
    insert into production_versions (creative_id, field, version_no, body, slides, created_by)
    values (p_creative_id, p_field, coalesce(v_latest.version_no, 0) + 1, v_body, v_slides, auth.uid())
    returning * into v_saved;
  end if;

  if p_field = 'voiceover' then
    update creatives set voiceover = v_body where id = p_creative_id;
  elsif p_field = 'thumbnail_text' then
    update creatives set thumbnail_text = v_body where id = p_creative_id;
  else
    update creatives set slide_text = v_slides where id = p_creative_id;
  end if;

  return jsonb_build_object('id', v_saved.id, 'version_no', v_saved.version_no);
end;
$$;

revoke all on function save_production_version(uuid, text, text, text, text[], uuid) from public, anon;
grant execute on function save_production_version(uuid, text, text, text, text[], uuid) to authenticated;

-- Words written on the post another way (a row added in the table, the
-- previous release while this rolls out) go into its latest version, or a
-- first one, so the versions never fall behind the post.
create or replace function creatives_production_to_versions() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  f text;
  v_body text;
  v_slides text[];
  v_latest production_versions;
begin
  foreach f in array array['voiceover', 'slide_text', 'thumbnail_text'] loop
    if f = 'voiceover' then
      v_body := new.voiceover; v_slides := '{}';
      if tg_op = 'UPDATE' and new.voiceover is not distinct from old.voiceover then continue; end if;
    elsif f = 'thumbnail_text' then
      v_body := new.thumbnail_text; v_slides := '{}';
      if tg_op = 'UPDATE' and new.thumbnail_text is not distinct from old.thumbnail_text then continue; end if;
    else
      v_body := null; v_slides := coalesce(new.slide_text, '{}');
      if tg_op = 'UPDATE' and new.slide_text is not distinct from old.slide_text then continue; end if;
    end if;
    -- Nothing written: nothing to keep.
    if coalesce(btrim(v_body), '') = '' and not exists (select 1 from unnest(v_slides) s where btrim(s) <> '') then
      continue;
    end if;
    select * into v_latest from production_versions
    where creative_id = new.id and field = f order by version_no desc limit 1;
    if v_latest.id is null then
      insert into production_versions (creative_id, agency_id, field, version_no, body, slides, created_by)
      values (new.id, new.agency_id, f, 1, v_body, v_slides, new.updated_by);
    elsif v_latest.body is distinct from v_body or v_latest.slides is distinct from v_slides then
      update production_versions
      set body = v_body, slides = v_slides, edited_by = new.updated_by, edited_at = now()
      where id = v_latest.id;
    end if;
  end loop;
  return new;
end;
$$;
create trigger creatives_production_to_versions
  after insert or update of voiceover, slide_text, thumbnail_text on creatives
  for each row execute function creatives_production_to_versions();

-- Each post's words as they stand, as V1.
insert into production_versions (creative_id, agency_id, field, version_no, body, slides, created_by, created_at)
select c.id, c.agency_id, 'voiceover', 1, c.voiceover, '{}', c.updated_by, c.updated_at
from creatives c where coalesce(btrim(c.voiceover), '') <> '';
insert into production_versions (creative_id, agency_id, field, version_no, body, slides, created_by, created_at)
select c.id, c.agency_id, 'thumbnail_text', 1, c.thumbnail_text, '{}', c.updated_by, c.updated_at
from creatives c where coalesce(btrim(c.thumbnail_text), '') <> '';
insert into production_versions (creative_id, agency_id, field, version_no, body, slides, created_by, created_at)
select c.id, c.agency_id, 'slide_text', 1, null, c.slide_text, c.updated_by, c.updated_at
from creatives c where exists (select 1 from unnest(coalesce(c.slide_text, '{}')) s where btrim(s) <> '');

-- So the API sees the new table straight away.
notify pgrst, 'reload schema';
