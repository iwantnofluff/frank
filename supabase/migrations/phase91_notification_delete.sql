-- Phase 91 — deleting read notifications from the bell.
--
-- Decided directly (12 Oct 2026): the bell's Read list can be selected,
-- all or some, and deleted. Each person deletes only their own, and only
-- ones they've read; an unread one can't be deleted unseen.

-- phase60 granted select and update (read_at) only; delete too, which the
-- policy below then limits.
grant delete on notifications to authenticated;

drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications
  for delete using (user_id = auth.uid() and in_request_agency(agency_id) and read_at is not null);

notify pgrst, 'reload schema';
