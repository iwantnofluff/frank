-- Phase 116 — tips, and how often each person wants them.
--
-- Decided directly (22 Oct 2026): a tip shows top right for 5 seconds, for
-- the team only, drawn from Help. Each person sets how often in their own
-- Notifications settings: once a day (the default, the first time they
-- open Frank that day), every 1, 2, 3 or 4 hours, or off. Kept on the
-- person, as releases_seen is (phase81), so it follows them across
-- devices. Each person writes their own (users_update_self).

alter table users
  -- Hours between tips: 24 is once a day, 0 is off.
  add column if not exists tips_every_hours integer not null default 24
    check (tips_every_hours in (0, 1, 2, 3, 4, 24)),
  -- The tips they've been shown, by id (lib/tips.ts).
  add column if not exists tips_seen text[] not null default '{}',
  -- When the last one showed.
  add column if not exists tips_last_at timestamptz;

-- So the API sees the new columns straight away.
notify pgrst, 'reload schema';
