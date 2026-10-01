-- Phase 27 — client descriptions, and moving a project to another client.
--
-- 1. clients.description — a short paragraph about the client, shown on
--    its projects page under its name. The client's profile image needs no
--    schema: clients.logo_asset_id already existed.
--
-- 2. move_project_to_client() — per direct instruction, a project can move
--    to another client, landing at that client's top level (out of any
--    folder; the folder it left stays, even if now empty). Its Share for
--    Review links are revoked in the same transaction, also per direct
--    instruction: they were sent to the previous client's contacts, who
--    shouldn't keep seeing a project that now belongs to someone else.
--
--    SECURITY INVOKER (the default) on purpose: projects_update's RLS
--    decides who may do this, checked against both the old client (USING)
--    and the new one (the same expression, applied to the moved row), so a
--    restricted User can only move between clients they can act on. The
--    function only adds what RLS can't: same-agency, an active target, a
--    readable message for a name clash, and making the two writes atomic.

alter table clients add column description text check (char_length(description) <= 500);

create or replace function move_project_to_client(p_project_id uuid, p_client_id uuid)
returns void
language plpgsql as $$
declare
  v_project projects%rowtype;
  v_target clients%rowtype;
  v_moved int;
begin
  select * into v_project from projects where id = p_project_id;
  if not found then
    raise exception 'project not found';
  end if;
  select * into v_target from clients where id = p_client_id;
  if not found then
    raise exception 'client not found';
  end if;
  if v_target.id = v_project.client_id then
    raise exception 'this project already belongs to that client';
  end if;
  if v_target.agency_id <> v_project.agency_id then
    raise exception 'a project can only move between clients in the same agency';
  end if;
  if v_target.archived_at is not null then
    raise exception 'that client is archived';
  end if;

  begin
    update projects
    set client_id = p_client_id, folder_id = null
    where id = p_project_id;
  exception when unique_violation then
    raise exception '% already has a project called "%"', v_target.name, v_project.name;
  end;
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise exception 'not permitted to move this project';
  end if;

  update shared_links
  set revoked_at = now()
  where project_id = p_project_id and revoked_at is null;
end;
$$;

grant execute on function move_project_to_client(uuid, uuid) to authenticated;
