-- Phase 152 — comments on the VO's words are Private, always.
--
-- Decided directly (13 Nov 2026): the VO shows in the artwork's place for
-- the team (1.82.2), and its words can be picked for a comment as Text on
-- Image's are. The VO is the team's only, and such a comment quotes it, so
-- it can never be made public: not when posted, nor afterwards. Replies
-- under it are locked Private in the app; this guards the comment that
-- carries the quote.

alter table comments add constraint comments_vo_private
  check (anchor is null or anchor->>'field' is distinct from 'voiceover' or visibility = 'private');
