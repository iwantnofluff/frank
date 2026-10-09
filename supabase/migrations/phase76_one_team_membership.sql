-- Phase 76 — one place on the team per person.
--
-- Reported directly (9 Oct 2026): the same person listed twice on the Team
-- list, same email. memberships' unique (agency_id, user_id, client_id)
-- never covered the team, where client_id is null (nulls never clash), so
-- a second active team membership could be made: by a new invite, a
-- resent one, or reactivating an old one while another was active. One on
-- live: two Users, one with Casa Carigar, the other with No Fluff.
--
-- 1. Each set of duplicates becomes one: the highest role, then the first
--    to join, is kept, and takes the others' clients and projects. The
--    others are removed the way Remove does it (flagged, kept so past work
--    still links to the person), their grants gone.
-- 2. From now on the database refuses a second active team membership.
--
-- Note: as first run on live (9 Oct 2026), step 1 lacked the "only the
-- projects they had" line, so the one person merged gained the client's
-- other project; kept on both, decided directly (docs/parity-gaps.md).

do $$
declare
  d record;
  v_keep uuid;
  v_projects uuid[];
begin
  for d in
    select agency_id, user_id from memberships
    where client_id is null and removed_at is null
    group by agency_id, user_id having count(*) > 1
  loop
    select id into v_keep from memberships
    where agency_id = d.agency_id and user_id = d.user_id and client_id is null and removed_at is null
    order by case role when 'primary_owner' then 0 when 'owner' then 1 when 'admin' then 2 else 3 end,
             accepted_at nulls last, invited_at
    limit 1;

    -- The projects they had between them, before anything changes: giving
    -- a client (below) adds every project of it, by trigger, and only the
    -- ones they had should stay.
    select coalesce(array_agg(distinct p.project_id), '{}') into v_projects
    from project_access p join memberships m on m.id = p.membership_id
    where m.agency_id = d.agency_id and m.user_id = d.user_id and m.client_id is null and m.removed_at is null;

    insert into staff_client_access (agency_id, membership_id, client_id)
    select s.agency_id, v_keep, s.client_id from staff_client_access s
    join memberships m on m.id = s.membership_id
    where m.agency_id = d.agency_id and m.user_id = d.user_id and m.client_id is null
      and m.removed_at is null and m.id <> v_keep
    on conflict (membership_id, client_id) do nothing;

    insert into project_access (agency_id, membership_id, project_id)
    select p.agency_id, v_keep, p.project_id from project_access p
    join memberships m on m.id = p.membership_id
    where m.agency_id = d.agency_id and m.user_id = d.user_id and m.client_id is null
      and m.removed_at is null and m.id <> v_keep
    on conflict (membership_id, project_id) do nothing;
    delete from project_access where membership_id = v_keep and not (project_id = any (v_projects));

    delete from staff_client_access s using memberships m
    where m.id = s.membership_id and m.agency_id = d.agency_id and m.user_id = d.user_id
      and m.client_id is null and m.removed_at is null and m.id <> v_keep;
    delete from project_access p using memberships m
    where m.id = p.membership_id and m.agency_id = d.agency_id and m.user_id = d.user_id
      and m.client_id is null and m.removed_at is null and m.id <> v_keep;
    delete from invites i using memberships m
    where m.id = i.membership_id and i.accepted_at is null and m.agency_id = d.agency_id
      and m.user_id = d.user_id and m.client_id is null and m.removed_at is null and m.id <> v_keep;

    update memberships set removed_at = now(), removed_permanently_at = now()
    where agency_id = d.agency_id and user_id = d.user_id and client_id is null
      and removed_at is null and id <> v_keep;
  end loop;
end;
$$;

create unique index if not exists memberships_one_team_place
  on memberships (agency_id, user_id)
  where client_id is null and removed_at is null;
