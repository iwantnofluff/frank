-- Phase 58 — a post can have several reference links.
--
-- Decided directly (5 Oct 2026): "+ Add Reference" in the New Post
-- window, and each reference clickable wherever it shows. The single
-- reference_url becomes the first entry; that column stays as it was
-- (no longer written) so nothing is lost.

alter table creatives
  add column reference_urls text[] not null default '{}';

update creatives
set reference_urls = array[btrim(reference_url)]
where coalesce(btrim(reference_url), '') <> '';
