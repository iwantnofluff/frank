-- Phase 89 — what Draft with Frank reads beyond the post, per client.
--
-- Decided directly (11 Oct 2026): Draft with Frank reads the client's
-- Approved posts for their voice, and the client's own comments for what
-- they've asked for. Each client chooses, in Preferences, whether Frank
-- reads each and from how far back:
--   frank_posts:    'off', or Approved in the last '3m', '6m', '12m', or 'all'
--   frank_feedback: 'off', or comments in the last '30d', '90d', '180d', or 'all'
-- Defaults: posts from the last 12 months, feedback from the last 90 days.
-- Owners and Admins change them, as every preference (phase70's policies).

alter table client_preferences
  add column if not exists frank_posts text not null default '12m'
    check (frank_posts in ('off', '3m', '6m', '12m', 'all')),
  add column if not exists frank_feedback text not null default '90d'
    check (frank_feedback in ('off', '30d', '90d', '180d', 'all'));

notify pgrst, 'reload schema';
