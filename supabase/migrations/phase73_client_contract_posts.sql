-- Phase 73 — posts a month, as the client's contract has it.
--
-- Decided directly (8 Oct 2026): Analytics compares what's delivered with
-- what's been promised. A client's contract sets a number of posts a
-- month; a post counts as delivered in the month it goes live, once
-- approved. Not set (null) until the agency enters it in the client's
-- Preferences.

alter table client_preferences add column contracted_posts_per_month int
  check (contracted_posts_per_month is null or contracted_posts_per_month between 0 and 1000);
