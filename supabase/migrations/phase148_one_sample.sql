-- Phase 148 — one sample client a workspace.
--
-- Frank Tour, Show Me and Ask Frank each make a workspace's sample when it
-- has none (lib/sample/ensure.ts). Two at once could make two; the
-- database now refuses the second, and ensure.ts uses the one that won.

create unique index if not exists clients_one_sample on clients (agency_id) where is_sample;
