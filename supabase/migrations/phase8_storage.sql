-- Phase 8 — Media Upload Engine: storage bucket + object-level RLS
--
-- The `assets` table has existed since Phase 1, but nothing could ever be
-- uploaded into it because the storage bucket itself was never created.
-- Storage has its own RLS layer on storage.objects, independent of the
-- policies on the assets/creative_versions tables — this file is that layer.

insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

-- Objects are stored at {agency_id}/{creative_id}/{uuid}-{filename}. The
-- first path segment being the agency_id is what lets these policies scope
-- access without a table join — storage.foldername() splits the object
-- path into segments.

-- Upload is a staff action — spec section 2 lists "upload creative
-- versions" under Account Manager, not under either client role, and
-- creative_versions_insert (added in Phase 1) already enforces the same
-- restriction at the table layer. This is that restriction's storage-layer
-- counterpart.
create policy assets_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets'
    and is_agency_staff(((storage.foldername(name))[1])::uuid)
  );

-- Read is coarser than the assets table's own SELECT policy (which also
-- checks a client-side user's specific creative access) — deliberately so.
-- storage.objects RLS can't cheaply join through creative_versions to
-- enforce that fine-grained check, and it doesn't need to: a client only
-- ever obtains a storage_key by first reading it through the
-- RLS-protected creative_versions/assets tables, which already did that
-- check. This layer's job is coarser and different — keep one agency's
-- files unreadable to another agency's members, full stop.
create policy assets_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assets'
    and ((storage.foldername(name))[1])::uuid in (select current_agency_ids())
  );
