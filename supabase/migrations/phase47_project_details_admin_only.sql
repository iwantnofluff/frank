-- Phase 47 — only Owners and Admins change a project's details.
--
-- Decided directly (4 Oct 2026): on the Project Profile, a User sees the
-- name, type, delivery, due date and description but can't change them.
-- Users can still update the rest of a project as before (moving it to a
-- folder or client, archiving it), so this guards the detail columns
-- rather than narrowing projects_update. No caller (the service role)
-- passes, as for every other caller-keyed rule.

create or replace function projects_details_admin_only()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or is_agency_admin(new.agency_id) then
    return new;
  end if;
  if (new.name, new.type, new.description, new.delivery, new.due_on)
     is distinct from (old.name, old.type, old.description, old.delivery, old.due_on) then
    raise exception 'Only Owners and Admins can change a project''s details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger projects_details_admin_only
  before update of name, type, description, delivery, due_on on projects
  for each row execute function projects_details_admin_only();
