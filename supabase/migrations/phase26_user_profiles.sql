-- Phase 26 — profiles: first/last name, designation, bio, photo.
--
-- Per direct instruction, names and designation are always stored in
-- title case, however they were typed. The app formats as you type, but a
-- trigger is what guarantees it — every write path (the invite route's
-- service-role client, the Your Profile page's own session) goes through
-- it. An all-lowercase word is title-cased with initcap(), which also
-- capitalises after an apostrophe or hyphen ("o'neil" -> "O'Neil",
-- "smith-jones" -> "Smith-Jones"). A word that already has capitals only
-- has its first letter raised, so "CEO", "UX" and "McDonald" survive —
-- flattening all-caps words would turn "UX Designer" into "Ux Designer".
-- Small joining words stay lowercase after the first word ("Head of
-- Design"). users.name stays the one display name every
-- screen already reads; it's rebuilt from first + last whenever a first
-- name is set.
--
-- Photos are ordinary assets rows (users.avatar_asset_id already existed),
-- stored at {agency_id}/avatars/{user_id}/... so the existing bucket
-- policies apply unchanged: staff upload into their own agency's folder,
-- and every member of that agency can read files in it. assets_select
-- gains one branch so a client-side member can resolve a staff member's
-- photo next to their comments — staff could already see every asset.

alter table users
  add column first_name text,
  add column last_name text,
  add column designation text,
  add column bio text check (char_length(bio) <= 300);

create or replace function title_case(input text)
returns text
language plpgsql immutable as $$
declare
  words text[];
  w text;
  i int;
  result text[] := '{}';
  minor constant text[] := array['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'];
begin
  if input is null or btrim(input) = '' then
    return null;
  end if;
  words := regexp_split_to_array(btrim(regexp_replace(input, '\s+', ' ', 'g')), ' ');
  for i in 1 .. array_length(words, 1) loop
    w := words[i];
    if i > 1 and lower(w) = any(minor) then
      result := result || lower(w);
    elsif w = lower(w) then
      result := result || initcap(w);
    else
      result := result || (upper(left(w, 1)) || substr(w, 2));
    end if;
  end loop;
  return array_to_string(result, ' ');
end;
$$;

create or replace function normalise_user_profile()
returns trigger language plpgsql as $$
begin
  new.first_name := title_case(new.first_name);
  new.last_name := title_case(new.last_name);
  new.designation := title_case(new.designation);
  new.bio := nullif(btrim(new.bio), '');
  if new.first_name is not null then
    new.name := btrim(new.first_name || ' ' || coalesce(new.last_name, ''));
  end if;
  return new;
end;
$$;

create trigger users_normalise_profile
  before insert or update on users
  for each row execute function normalise_user_profile();

-- Existing people: split today's single name on its first space. Goes
-- through the trigger above, so it's title-cased on the way in too.
update users
set first_name = split_part(btrim(name), ' ', 1),
    last_name = nullif(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), '')
where first_name is null and btrim(name) <> '';

drop policy assets_select on assets;
create policy assets_select on assets
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or exists (
        select 1 from creative_versions
        join creatives on creatives.id = creative_versions.creative_id
        join projects on projects.id = creatives.project_id
        where creative_versions.asset_id = assets.id
          and projects.client_id in (select current_client_ids(assets.agency_id))
      )
      or exists (
        select 1 from clients
        where clients.logo_asset_id = assets.id
          and clients.id in (select current_client_ids(assets.agency_id))
      )
      or exists (
        select 1 from knowledge_entries
        where knowledge_entries.asset_id = assets.id
          and knowledge_entries.client_id in (select current_client_ids(assets.agency_id))
      )
      or exists (select 1 from users where users.avatar_asset_id = assets.id)
    )
  );
