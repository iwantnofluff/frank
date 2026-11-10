-- Phase 144 — Frank Tour: when each person was shown it.
--
-- Decided directly (10 Nov 2026): a short guided tour of the basics, shown
-- once to someone the first time they open Frank, and replayable from Frank
-- Tour in their account menu. Only people who haven't signed in before see
-- it on their own; everyone already using Frank is marked as shown, so it
-- doesn't appear for them unasked. Kept on the person, as tips_seen is
-- (phase116), so it follows them across devices. Each person writes their
-- own (users_update_self).

alter table users
  add column if not exists tour_seen_at timestamptz;

-- Everyone who has signed in already: shown. Someone invited but not yet
-- signed in sees it on their first visit.
update users u
   set tour_seen_at = now()
  from auth.users a
 where a.id = u.id
   and a.last_sign_in_at is not null
   and u.tour_seen_at is null;

-- So the API sees the new column straight away.
notify pgrst, 'reload schema';
