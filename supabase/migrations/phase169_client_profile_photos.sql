-- A client's own people can upload a profile photo (reported directly: My
-- Profile's Upload photo failed for a client with "new row violates
-- row-level security policy").
--
-- Two things stopped it:
-- 1. storage.objects' only insert policy (assets_bucket_insert) is staff
--    only. A second, permissive policy lets anyone in the agency upload to
--    their own avatar folder, {agency_id}/avatars/{their user id}/, and
--    nowhere else. Staff are unaffected.
-- 2. uploadAvatar inserts the assets row with RETURNING, and a client may
--    only see an avatar asset once a users row points at it, which comes
--    after. A second select policy lets the uploader see their own avatar
--    assets, so the insert can read back its id. Nothing else is opened.

create policy assets_bucket_insert_own_avatar on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[2] = 'avatars'
    and (storage.foldername(name))[3] = auth.uid()::text
    and ((storage.foldername(name))[1])::uuid in (select current_agency_ids())
  );

create policy assets_select_own_avatar on public.assets
  for select to authenticated
  using (
    created_by = auth.uid()
    and split_part(storage_key, '/', 2) = 'avatars'
    and split_part(storage_key, '/', 3) = auth.uid()::text
    and agency_id in (select current_agency_ids())
  );
