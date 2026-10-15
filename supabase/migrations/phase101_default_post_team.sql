-- Phase 101 — who's on a new post by default.
--
-- Decided directly (15 Oct 2026): in a project's settings, each of the
-- team (Owners, Admins, Users) can be ticked to be on every new post's
-- Team by default; a new post starts with them, and its Team can still be
-- changed. Chosen by Owners and Admins, as the project's people are.

alter table projects add column if not exists default_team_user_ids uuid[] not null default '{}';

-- phase96's guard, with the new list among the details only Owners and
-- Admins change.
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
  if (new.name, new.type, new.description, new.delivery, new.due_on, new.icon,
      new.default_hidden_columns, new.default_column_order, new.column_labels, new.default_team_user_ids)
     is distinct from (old.name, old.type, old.description, old.delivery, old.due_on, old.icon,
      old.default_hidden_columns, old.default_column_order, old.column_labels, old.default_team_user_ids) then
    raise exception 'Only Owners and Admins can change a project''s details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_details_admin_only on projects;
create trigger projects_details_admin_only
  before update of name, type, description, delivery, due_on, icon, archived_at, client_id,
    default_hidden_columns, default_column_order, column_labels, default_team_user_ids on projects
  for each row execute function projects_details_admin_only();
