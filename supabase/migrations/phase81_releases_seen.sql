-- Phase 81 — the last of Frank's updates each person has seen.
--
-- Decided directly (9 Oct 2026): every new version of Frank (lib/releases.ts)
-- puts a notice in the team's bell until it's read. Kept on the person, so
-- reading it on one device clears it on all of them. Null: someone who has
-- seen none yet, who is told only about the newest. Each person writes
-- their own (users_update_self).

alter table users add column if not exists releases_seen text;
