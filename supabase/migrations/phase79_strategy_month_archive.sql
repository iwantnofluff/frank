-- Phase 79 — archiving a month's strategy.
--
-- Decided directly (9 Oct 2026): Client Settings → Knowledge → Strategy
-- lists the months someone has added (Add Month), Active or Archived like a
-- client's projects. Archiving only tidies the list: Draft with Frank still
-- follows an archived month's strategy for posts going live in it (decided
-- directly). Who may archive is who may write it (phase78's policies).

alter table client_monthly_strategies add column if not exists archived_at timestamptz;
