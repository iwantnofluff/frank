-- Phase 85 — a person's role on a project.
--
-- Decided directly (10 Oct 2026): Project Settings has a field for each
-- person on the project's team to say their role there (Lead, Content,
-- Designer…). Left blank, nothing shows; filled in, the project's table
-- shows it in brackets after their name in the Team column (the Lead
-- column, renamed).
--
-- Any of the project's team can have one, Owners and Admins included (they
-- lead posts but aren't on project_access). Read by whoever can see the
-- project, as the table's names are; written by the Primary Owner, Owners
-- and Admins, as people are put on projects (phase46). A blank role is no
-- row. It goes with the project, and with the person.

create table project_roles (
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  role text not null check (length(trim(role)) between 1 and 40),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create trigger project_roles_set_agency_id
  before insert or update of project_id on project_roles
  for each row execute function set_agency_id_from_project();
create trigger zz_read_only_guard before insert or update or delete on project_roles
  for each row execute function block_writes_when_read_only();

alter table project_roles enable row level security;
create policy project_roles_select on project_roles
  for select using (project_id in (select visible_project_ids(agency_id)));
create policy project_roles_insert on project_roles
  for insert with check (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_roles_update on project_roles
  for update using (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_roles_delete on project_roles
  for delete using (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));

notify pgrst, 'reload schema';
