-- Phase 94 — what a User can't change (decided directly, 13 Oct 2026).
--
-- Checked as a real signed-in User: the workspace's name, URL, model,
-- preferences and branding, team roles, other clients, and a client's or
-- project's details were already refused. Three things weren't, and are
-- now Owners' and Admins' only:
--   1. Format Directions (the drafting rules for every client).
--   2. Reference Material (the knowledge shared across every client).
--   3. Archiving or restoring a client or a project (renaming was already
--      refused by phase47's triggers; archived_at wasn't among their
--      columns).
-- Approving posts, approving review links, archiving posts and a client's
-- own Knowledge stay as they are for Users (decided directly).

-- 1. Format Directions.
drop policy if exists format_directions_insert on format_directions;
create policy format_directions_insert on format_directions
  for insert with check (is_agency_admin(agency_id));
drop policy if exists format_directions_update on format_directions;
create policy format_directions_update on format_directions
  for update using (is_agency_admin(agency_id));

-- 2. Reference Material.
drop policy if exists agency_knowledge_entries_insert on agency_knowledge_entries;
create policy agency_knowledge_entries_insert on agency_knowledge_entries
  for insert with check (is_agency_admin(agency_id));
drop policy if exists agency_knowledge_entries_update on agency_knowledge_entries;
create policy agency_knowledge_entries_update on agency_knowledge_entries
  for update using (is_agency_admin(agency_id));
drop policy if exists agency_knowledge_entries_delete on agency_knowledge_entries;
create policy agency_knowledge_entries_delete on agency_knowledge_entries
  for delete using (is_agency_admin(agency_id));

-- 3. Archiving a client or project: phase47's guards, archived_at added.
create or replace function clients_details_admin_only()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or is_agency_admin(new.agency_id) then
    return new;
  end if;
  if new.archived_at is distinct from old.archived_at then
    raise exception 'Only Owners and Admins can archive or restore a client'
      using errcode = '42501';
  end if;
  if (new.name, new.industry, new.description, new.logo_asset_id)
     is distinct from (old.name, old.industry, old.description, old.logo_asset_id) then
    raise exception 'Only Owners and Admins can change a client''s details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists clients_details_admin_only on clients;
create trigger clients_details_admin_only
  before update of name, industry, description, logo_asset_id, archived_at on clients
  for each row execute function clients_details_admin_only();

create or replace function projects_details_admin_only()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or is_agency_admin(new.agency_id) then
    return new;
  end if;
  if new.archived_at is distinct from old.archived_at then
    raise exception 'Only Owners and Admins can archive or restore a project'
      using errcode = '42501';
  end if;
  if (new.name, new.type, new.description, new.delivery, new.due_on, new.icon)
     is distinct from (old.name, old.type, old.description, old.delivery, old.due_on, old.icon) then
    raise exception 'Only Owners and Admins can change a project''s details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists projects_details_admin_only on projects;
create trigger projects_details_admin_only
  before update of name, type, description, delivery, due_on, icon, archived_at on projects
  for each row execute function projects_details_admin_only();

notify pgrst, 'reload schema';
