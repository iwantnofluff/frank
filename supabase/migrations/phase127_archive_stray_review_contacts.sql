-- Phase 127 — a review link offers only the people invited as Client.
--
-- Decided directly (1 Nov 2026): Joey Banks and other test names were in
-- the review link's "Who are you?" list. Since phase45 the list
-- (client_contacts) is kept in step with Client memberships, but names
-- already on it before then were left there. This archives every name on
-- a client's list that isn't an invited or accepted Client of that client,
-- so the list is exactly its Clients. Archived, not deleted (as removing
-- a Client does): their past comments keep their names, and a name comes
-- back by itself if that person is invited as Client later (phase45).
-- An archived name can't comment or approve on a link (phase77).
--
-- Run the first statement on its own to see who goes, then the second.

-- 1. Who goes: on a client's list, not archived, with no Client
--    membership for that client under the same email.
select a.name as agency, c.name as client, cc.name, cc.email, cc.created_at
from client_contacts cc
join clients c on c.id = cc.client_id
join agencies a on a.id = cc.agency_id
where cc.archived_at is null
  and not exists (
    select 1 from memberships m
    join users u on u.id = m.user_id
    where m.client_id = cc.client_id
      and m.removed_at is null
      and lower(u.email) = lower(cc.email)
  )
order by a.name, c.name, cc.name;

-- 2. Archive them.
update client_contacts cc
set archived_at = now()
where cc.archived_at is null
  and not exists (
    select 1 from memberships m
    join users u on u.id = m.user_id
    where m.client_id = cc.client_id
      and m.removed_at is null
      and lower(u.email) = lower(cc.email)
  );
