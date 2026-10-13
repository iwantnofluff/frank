-- Phase 95 — moving a project to another client is Owners' and Admins'.
--
-- Decided directly (13 Oct 2026), after phase94's check of a User's
-- rights: a User could move a project to another client they'd been given
-- (never to one they hadn't; RLS refused that). Now only Owners and Admins
-- can. move_project_to_client (phase27) runs as the caller and updates
-- projects.client_id, so phase47/94's guard, with client_id added, covers
-- it and a direct update alike.

create or replace function projects_details_admin_only()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or is_agency_admin(new.agency_id) then
    return new;
  end if;
  if new.client_id is distinct from old.client_id then
    raise exception 'Only Owners and Admins can move a project to another client'
      using errcode = '42501';
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
  before update of name, type, description, delivery, due_on, icon, archived_at, client_id on projects
  for each row execute function projects_details_admin_only();

notify pgrst, 'reload schema';
