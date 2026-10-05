-- Phase 56 — a project's picture: one of Frank's own emoticons.
--
-- Decided directly (5 Oct 2026): projects (not clients) can show an
-- emoticon in place of their initials on the client workspace's project
-- rows. The set is drawn for Frank and lives in the app
-- (lib/project-icons.ts); the row holds the icon's name, or null for the
-- initials. An unknown name shows the initials too, so the set can change
-- without touching rows. Picking one is a project detail, so Owners and
-- Admins only, as phase47.

alter table projects
  add column icon text
  check (icon ~ '^[a-z0-9-]{1,40}$');

create or replace function projects_details_admin_only()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or is_agency_admin(new.agency_id) then
    return new;
  end if;
  if (new.name, new.type, new.description, new.delivery, new.due_on, new.icon)
     is distinct from (old.name, old.type, old.description, old.delivery, old.due_on, old.icon) then
    raise exception 'Only Owners and Admins can change a project''s details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger projects_details_admin_only on projects;
create trigger projects_details_admin_only
  before update of name, type, description, delivery, due_on, icon on projects
  for each row execute function projects_details_admin_only();
