-- Phase 72 — each client's "sent ahead" promise.
--
-- Decided directly (8 Oct 2026): agencies promise clients content made four
-- weeks ahead, and clients complain about posts reaching them too late to
-- approve. Analytics measures, per post, how many days before its live date
-- it first went to the client (Client Review, from the stage log, phase71)
-- against this promise: 14, 21, 28 or 35 days, 28 unless changed in the
-- client's Preferences (phase70). A post sent with under 7 days to go is a
-- late send, for every client.

alter table client_preferences add column lead_days int not null default 28
  check (lead_days in (14, 21, 28, 35));
