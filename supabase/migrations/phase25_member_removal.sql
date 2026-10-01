-- Phase 25 — deactivated and removed members keep their name on past work.
--
-- users_select only showed people with an *active* membership in a shared
-- agency, so the moment someone was deactivated their name vanished from
-- the Team list and from every comment and approval they'd authored.
-- Direct instruction was the opposite: removing someone takes their access,
-- not their name off past work. Current members can now see anyone who has
-- ever held a membership in their agency — the same people they could see
-- before those people left.
--
-- For that to hold after "Remove from Team", the membership row has to
-- survive as the link between the person and the agency, so Remove is now
-- a flag rather than a delete: removed_at cuts access (as deactivating
-- does), removed_permanently_at additionally drops them from the Team list
-- and from Reactivate. Revoking a never-accepted invite still deletes the
-- row outright — there's no past work to keep attributed.

alter table memberships add column removed_permanently_at timestamptz;

drop policy users_select on users;
create policy users_select on users
  for select using (
    id = auth.uid()
    or exists (
      select 1 from memberships m1
      join memberships m2 on m1.agency_id = m2.agency_id
      where m1.user_id = auth.uid() and m1.removed_at is null
        and m2.user_id = users.id
    )
  );
