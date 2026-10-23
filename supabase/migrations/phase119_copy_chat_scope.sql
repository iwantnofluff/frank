-- Phase 119 — a Draft with Frank on each tab.
--
-- Decided directly (23 Oct 2026): the post window gets a Production tab
-- (Thumbnail Text on Image, VO, Text on Image), between Brief and Content,
-- each with its own Draft with Frank: Content's drafts the copy, Production's
-- the words for making the creative. So each conversation says which it
-- is. Every conversation so far covered the copy first, so they're
-- Content's.

alter table copy_chats
  add column if not exists scope text not null default 'copy'
    check (scope in ('copy', 'production'));

-- So the API sees the new column straight away.
notify pgrst, 'reload schema';
