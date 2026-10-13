-- Phase 96 — a project's columns: its defaults, and columns of its own.
--
-- Decided directly (13 Oct 2026): a new project's second step lists every
-- column with its type, all ticked, to reorder by dragging, rename, untick
-- or add to; whatever's set there is the project's Main Table (its order,
-- hidden columns and names). Owners and Admins can add columns of the
-- project's own, from that step or the table's Columns picker, choosing
-- what each records: Single Line Text, Large Text, Number, Date, Dropdown
-- or Checkbox. A post's window then asks for them. A rename applies to the
-- project everywhere (decided directly). Later changes to order and
-- what's shown are saved as views, which now belong to their project
-- (decided directly). Owners and Admins only, as the rest of a project's
-- set-up.

-- Large Text and Date, beside text, number, dropdown, checkbox (and status,
-- kept for any column already using it).
alter type custom_column_type add value if not exists 'long_text';
alter type custom_column_type add value if not exists 'date';

-- The Main Table's hidden columns and order, chosen when the project is
-- made (null order: the planner's own), and its renamed columns (built-in
-- column key to name; a project's own columns are renamed in place).
alter table projects add column if not exists default_hidden_columns text[] not null default '{}';
alter table projects add column if not exists default_column_order text[];
alter table projects add column if not exists column_labels jsonb not null default '{}'::jsonb;

-- A saved view belongs to its project; those made before stay shared
-- (project_id null) until saved over from a project. Names are unique
-- within a project, or among the shared ones.
alter table calendar_views add column if not exists project_id uuid references projects (id) on delete cascade;
drop index if exists calendar_views_agency_table_type_name_key;
create unique index if not exists calendar_views_project_name_key
  on calendar_views (agency_id, table_type, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- Adding, changing and removing a project's columns: Owners and Admins.
drop policy if exists custom_columns_insert on custom_columns;
create policy custom_columns_insert on custom_columns
  for insert with check (is_agency_admin(agency_id));
drop policy if exists custom_columns_update on custom_columns;
create policy custom_columns_update on custom_columns
  for update using (is_agency_admin(agency_id));
drop policy if exists custom_columns_delete on custom_columns;
create policy custom_columns_delete on custom_columns
  for delete using (is_agency_admin(agency_id));

-- A project's default columns are set-up too: phase95's guard, with them.
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
      new.default_hidden_columns, new.default_column_order, new.column_labels)
     is distinct from (old.name, old.type, old.description, old.delivery, old.due_on, old.icon,
      old.default_hidden_columns, old.default_column_order, old.column_labels) then
    raise exception 'Only Owners and Admins can change a project''s details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists projects_details_admin_only on projects;
create trigger projects_details_admin_only
  before update of name, type, description, delivery, due_on, icon, archived_at, client_id,
    default_hidden_columns, default_column_order, column_labels on projects
  for each row execute function projects_details_admin_only();

notify pgrst, 'reload schema';
