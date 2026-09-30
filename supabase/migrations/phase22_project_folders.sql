-- Folders for organising a client's projects on the "All Projects" screen.
-- Scoped per client (not agency-wide), one folder per project (not tags),
-- per direct instruction. A project with no folder just isn't assigned
-- one — deleting a folder un-files its projects rather than cascading,
-- matching "unfiled projects sit in the flat list above the folders."

create table project_folders (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id), -- denormalised from client, for RLS — same shape as projects.agency_id
  client_id uuid not null references clients (id),
  name text not null,
  position int not null default 0,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create index project_folders_client_idx on project_folders (client_id, position);

-- Reuses the same trigger function projects/knowledge_entries already use
-- to derive agency_id from client_id — nothing table-specific about it.
create trigger project_folders_set_agency_id
  before insert or update of client_id on project_folders
  for each row execute function set_agency_id_from_client();

alter table projects add column folder_id uuid references project_folders (id) on delete set null;

-- A project's folder (if any) must belong to the same client — otherwise
-- staff could file a project under another client's folder entirely.
-- Mirrors check_creative_delivery_fields' own shape: a narrow, row-local
-- validation trigger rather than a cross-table check constraint.
create or replace function check_project_folder_client()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_folder_client_id uuid;
begin
  if new.folder_id is not null then
    select client_id into v_folder_client_id from project_folders where id = new.folder_id;
    if v_folder_client_id is null or v_folder_client_id <> new.client_id then
      raise exception 'folder does not belong to this project''s client';
    end if;
  end if;
  return new;
end;
$$;

create trigger projects_check_folder_client
  before insert or update of folder_id, client_id on projects
  for each row execute function check_project_folder_client();

alter table project_folders enable row level security;

-- Same client-scoping shape as clients/projects themselves: staff see
-- every folder in the agency, client-side users see only their own
-- client's folders (so a shared project list reads the same grouping).
create policy project_folders_select on project_folders
  for select using (
    agency_id in (select current_agency_ids())
    and (is_agency_staff(agency_id) or client_id in (select current_client_ids(agency_id)))
  );
create policy project_folders_insert on project_folders
  for insert with check (is_agency_staff(agency_id));
create policy project_folders_update on project_folders
  for update using (is_agency_staff(agency_id));
-- Unlike clients/projects (archive-only, no delete policy at all), a
-- folder is just an organisational label with nothing irreplaceable
-- under it — its own projects un-file (on delete set null) rather than
-- being deleted, so a real delete here is safe to allow outright.
create policy project_folders_delete on project_folders
  for delete using (is_agency_staff(agency_id));
