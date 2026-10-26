-- Phase 123 — statuses within In Production and Internal Review.
--
-- Decided directly (26 Oct 2026): In Production and Internal Review each
-- get a list of statuses a post moves through, per project, managed in
-- the project's Settings (add, rename, reorder, delete). Every project
-- starts with:
--   In Production: In Progress (Content), In Progress (Creative)
--   Internal Review: Internal QC (Copy), Internal QC (Creative), Hold, Cancel
-- The stages themselves stay as they are. A post entering either stage
-- (by hand, by its Concept being approved, or by its first content being
-- saved) takes the stage's first status; leaving them clears it. The
-- team's only: clients never read the statuses. Deleting one moves its
-- posts to the first status left in that stage. Owners and Admins change
-- the list, as with the project's roles (phase94).

create table project_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  -- 2 In Production, 3 Internal Review (lib/stage-labels.ts STAGE).
  stage smallint not null check (stage in (2, 3)),
  label text not null check (length(trim(label)) between 1 and 40),
  position int not null default 0,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index project_statuses_project on project_statuses (project_id, stage, position);

create trigger project_statuses_set_agency_id
  before insert or update of project_id on project_statuses
  for each row execute function set_agency_id_from_project();
create trigger zz_read_only_guard before insert or update or delete on project_statuses
  for each row execute function block_writes_when_read_only();

alter table project_statuses enable row level security;
create policy project_statuses_select on project_statuses
  for select using (is_agency_staff(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_statuses_insert on project_statuses
  for insert with check (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_statuses_update on project_statuses
  for update using (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)))
  with check (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy project_statuses_delete on project_statuses
  for delete using (is_agency_admin(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));

-- A post's status within its stage.
alter table creatives add column status_id uuid references project_statuses (id) on delete set null;

-- The stage's first status in a project.
create or replace function first_project_status(p_project_id uuid, p_stage smallint)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select id from project_statuses
  where project_id = p_project_id and stage = p_stage
  order by position, created_at
  limit 1
$$;

-- Keeps a post's status in step with its stage: the first status when it
-- enters In Production or Internal Review (or has none there), none
-- elsewhere, and only ever one of its own project's, for its own stage.
create or replace function creatives_keep_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok boolean;
begin
  if new.stage not in (2, 3) then
    new.status_id := null;
    return new;
  end if;
  v_ok := new.status_id is not null and exists (
    select 1 from project_statuses
    where id = new.status_id and project_id = new.project_id and stage = new.stage
  );
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage and new.status_id is not distinct from old.status_id then
    -- Moved stage without choosing a status: the new stage's first.
    new.status_id := first_project_status(new.project_id, new.stage::smallint);
  elsif not v_ok then
    if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id and new.status_id is not null then
      raise exception 'That status isn''t one of this post''s stage';
    end if;
    new.status_id := first_project_status(new.project_id, new.stage::smallint);
  end if;
  return new;
end;
$$;

-- Late among the before triggers, so it sees the stage any earlier one set.
create trigger zy_creatives_keep_status
  before insert or update of stage, status_id, project_id on creatives
  for each row execute function creatives_keep_status();

-- A status deleted: its posts move to the first left in its stage.
create or replace function project_statuses_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update creatives
  set status_id = (
    select id from project_statuses
    where project_id = old.project_id and stage = old.stage and id <> old.id
    order by position, created_at
    limit 1
  )
  where status_id = old.id;
  return old;
end;
$$;

create trigger project_statuses_move_posts
  before delete on project_statuses
  for each row execute function project_statuses_before_delete();

-- Every project's defaults.
create or replace function seed_project_statuses(p_project_id uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into project_statuses (project_id, stage, label, position)
  values
    (p_project_id, 2, 'In Progress (Content)', 0),
    (p_project_id, 2, 'In Progress (Creative)', 1),
    (p_project_id, 3, 'Internal QC (Copy)', 0),
    (p_project_id, 3, 'Internal QC (Creative)', 1),
    (p_project_id, 3, 'Hold', 2),
    (p_project_id, 3, 'Cancel', 3)
$$;
revoke all on function seed_project_statuses(uuid) from public, anon, authenticated;

create or replace function projects_seed_statuses()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform seed_project_statuses(new.id);
  return new;
end;
$$;

create trigger projects_seed_statuses
  after insert on projects
  for each row execute function projects_seed_statuses();

-- The projects there already, then their posts in those stages.
select seed_project_statuses(p.id)
from projects p
where not exists (select 1 from project_statuses s where s.project_id = p.id);

-- Without touching when each post was last updated: filling in a status
-- isn't an edit anyone made.
alter table creatives disable trigger creatives_stamp_update;
update creatives
set status_id = first_project_status(project_id, stage::smallint)
where stage in (2, 3) and status_id is null;
alter table creatives enable trigger creatives_stamp_update;

-- So the API sees the new table and column straight away.
notify pgrst, 'reload schema';
