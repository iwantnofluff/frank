-- Phase 92 — how far back a review link lists Approved posts.
--
-- Decided directly (12 Oct 2026): a review link's list shows Approved
-- posts from recent days only, so it stays short as a project goes on
-- (1.22.4 fixed it at 30 days). Each workspace now sets it in Settings →
-- General → Preferences: 7, 14, 21 or 28 days, or Always (null). Default 14
-- days, decided directly; a workspace with no settings row gets 14 too
-- (the review link's route). A link always keeps the posts it was made
-- for, whatever this says. Owners and Admins change it (agency_settings'
-- phase7 policies).

alter table agency_settings
  add column if not exists review_approved_days int default 14
    check (review_approved_days in (7, 14, 21, 28));

notify pgrst, 'reload schema';
