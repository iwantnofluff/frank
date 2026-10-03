-- Phase 40 — the assets bucket is private, with its file types written down.
--
-- phase8 creates the bucket private, and the app only ever reads it through
-- short-lived signed links (use-asset-signed-url, use-avatar-urls, the
-- shared-review route). Production's had been switched to public outside
-- any migration, so anyone with a file's address could open it without
-- signing in. Found replaying the chain onto staging (3 Oct 2026), whose
-- bucket came out private as intended.
--
-- Production also limits which file types can be uploaded, again set by
-- hand; written down here so every database built from these migrations
-- has the same list. phase34 already sets the 50 MB size limit.

update storage.buckets
set
  public = false,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif',
    'video/mp4', 'video/mov', 'video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ]
where id = 'assets';
