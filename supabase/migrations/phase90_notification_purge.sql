-- Phase 90 — read notifications don't stay forever.
--
-- Decided directly (12 Oct 2026): the bell kept every notification, read
-- or not, so a read one looked stuck. The bell now splits Unread and Read,
-- and each workspace sets, in Settings → General, how long a notification
-- is kept once it's been read: 30, 60 or 90 days (default 90). Unread ones
-- are never removed. Owners and Admins change it (agency_settings'
-- phase7 policies); the daily run (/api/cron/artwork) removes them.

alter table agency_settings
  add column if not exists notification_keep_days int not null default 90
    check (notification_keep_days in (30, 60, 90));

-- Read notifications older than their workspace keeps them (90 days where
-- the workspace has no settings row yet). The server's daily run only.
create or replace function purge_read_notifications()
returns int
language sql security definer set search_path = public, extensions as $$
  with gone as (
    delete from notifications n
    where n.read_at is not null
      and n.read_at < now() - make_interval(days => coalesce(
        (select s.notification_keep_days from agency_settings s where s.agency_id = n.agency_id), 90))
    returning 1
  )
  select count(*)::int from gone;
$$;
revoke execute on function purge_read_notifications() from public, anon, authenticated;

notify pgrst, 'reload schema';
