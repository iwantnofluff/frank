-- Phase 63 — within an agency, someone is on the team or at a client, never
-- both.
--
-- Decided directly (6 Oct 2026): the same person was able to be a team
-- User with access to a client and, at once, a Client of it (each invite
-- made its own membership). Now an agency's active memberships for one
-- person are either all staff (client_id null) or all client-side (one per
-- client). Moving someone across is changing their type (phase49's
-- change_member_type), which changes the one membership in place.
-- /api/team/invite says so first, plainly; this is the backstop for every
-- other path. Deactivated memberships (removed_at set) don't count.

create or replace function memberships_team_or_client()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_other memberships%rowtype;
  v_client text;
begin
  if new.removed_at is not null then
    return new;
  end if;
  select * into v_other from memberships m
  where m.agency_id = new.agency_id
    and m.user_id = new.user_id
    and m.id <> new.id
    and m.removed_at is null
    and (m.client_id is null) <> (new.client_id is null)
  limit 1;
  if not found then
    return new;
  end if;
  if v_other.client_id is null then
    raise exception 'They''re on your team, so they can''t also be a Client. Give them the client from its People instead.'
      using errcode = '23505';
  end if;
  select name into v_client from clients where id = v_other.client_id;
  raise exception 'They''re a Client of %, so they can''t also be on your team. Change their type in Team settings instead.', coalesce(v_client, 'a client')
    using errcode = '23505';
end;
$$;

create trigger memberships_team_or_client
  before insert or update of client_id, removed_at on memberships
  for each row execute function memberships_team_or_client();
