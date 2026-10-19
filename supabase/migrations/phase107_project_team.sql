-- phase107: a project's team, for its posts' Team (direct instruction:
-- only the project's team can be put on a post). Exactly who the project's
-- People panel lists from the team side: every Owner and Admin (on every
-- project), and the Users added to this one. Never a client's people.
--
-- A User can only read their own project_access rows (project_access_select),
-- so the app can't work this out for them from the tables; this answers it,
-- user ids only, and only for someone on the team who can see the project.

create or replace function project_team_user_ids(p_project_id uuid)
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select m.user_id
  from memberships m
  join projects p on p.agency_id = m.agency_id
  where p.id = p_project_id
    and p_project_id in (select my_staff_visible_project_ids())
    and m.client_id is null
    and m.removed_at is null
    and (
      m.role in ('admin', 'owner', 'primary_owner')
      or exists (select 1 from project_access pa where pa.membership_id = m.id and pa.project_id = p_project_id)
    );
$$;

revoke all on function project_team_user_ids(uuid) from public, anon;
grant execute on function project_team_user_ids(uuid) to authenticated;
