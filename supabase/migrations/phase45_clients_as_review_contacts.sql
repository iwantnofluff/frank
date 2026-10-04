-- Phase 45 — the people invited as Client are who a review link offers.
--
-- Decided directly (4 Oct 2026): the New Client form's separate "Client
-- Team" list goes; inviting someone as Client (phase44) covers it. A review
-- link still offers names to pick from (get_shared_review reads
-- client_contacts), so a Client membership keeps its client's list in step:
-- added when invited (so they can pick their name before accepting),
-- renamed when they accept with their own name, dropped when removed.
-- Names already on the list stay. Nothing else reads or changes.

create or replace function sync_client_contact_from_membership()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text;
  v_email text;
begin
  if new.client_id is null then return new; end if;
  select coalesce(nullif(btrim(u.name), ''), u.email), u.email into v_name, v_email
  from users u where u.id = new.user_id;
  if v_email is null then return new; end if;

  if new.removed_at is not null then
    update client_contacts set archived_at = coalesce(archived_at, now())
    where client_id = new.client_id and lower(email) = lower(v_email);
    return new;
  end if;

  update client_contacts set name = v_name, archived_at = null
  where client_id = new.client_id and lower(email) = lower(v_email);
  if not found then
    insert into client_contacts (agency_id, client_id, name, email)
    values (new.agency_id, new.client_id, v_name, v_email);
  end if;
  return new;
end;
$$;

create trigger sync_client_contact
  after insert or update of accepted_at, removed_at on memberships
  for each row execute function sync_client_contact_from_membership();

-- The Clients there already.
insert into client_contacts (agency_id, client_id, name, email)
select m.agency_id, m.client_id, coalesce(nullif(btrim(u.name), ''), u.email), u.email
from memberships m
join users u on u.id = m.user_id
where m.client_id is not null
  and m.removed_at is null
  and not exists (
    select 1 from client_contacts cc
    where cc.client_id = m.client_id and lower(cc.email) = lower(u.email)
  );
