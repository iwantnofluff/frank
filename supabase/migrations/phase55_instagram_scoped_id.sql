-- Phase 55 — keep both of an Instagram account's IDs.
--
-- Meta tells Frank when someone removes it from their Instagram, or asks
-- for their data to be deleted (deauthorize and data deletion callbacks),
-- naming the person by an ID. Instagram gives an account two (its
-- professional account ID, already kept as ig_user_id, and an ID scoped to
-- Frank's app), so both are kept and either matches.
alter table instagram_connections add column ig_scoped_id text;
create index instagram_connections_ig_user_idx on instagram_connections (ig_user_id);
create index instagram_connections_ig_scoped_idx on instagram_connections (ig_scoped_id);
