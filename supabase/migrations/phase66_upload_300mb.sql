-- Phase 66 — uploads up to 300MB a file.
--
-- Decided directly (8 Oct 2026): the limit goes from 200MB (phase60) to
-- 300MB, for post artwork (images, and videos after compressing) and
-- knowledge files. Frank checks the same limit before uploading
-- (lib/upload-limits.ts). Supabase's own project-wide upload limit, set in
-- its dashboard (Storage → Settings), has to allow at least this too.

update storage.buckets set file_size_limit = 314572800 where id = 'assets';
