-- Draft with Frank's Clean My Draft (direct instruction, 6 Nov 2026): a
-- third way to start a conversation, tidying the copy as written rather
-- than drafting or reviewing it. A conversation keeps the mode it began
-- with, so the check takes the new one.
alter table copy_chats drop constraint if exists copy_chats_mode_check;
alter table copy_chats add constraint copy_chats_mode_check check (mode in ('draft', 'review', 'clean'));
