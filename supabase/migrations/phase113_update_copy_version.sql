-- Phase 113 — saving caption changes into the current version.
--
-- Decided directly (21 Oct 2026): saving copy shouldn't always make a new
-- version. The team can save changes into the current version (a typo, a
-- tweak) as long as nobody has commented on it; once it has comments, a
-- change is a new version, so a comment always sits on the words it was
-- made about. Copy versions stay insert-only for everyone else: this
-- function is the one way to change one, and it says why when it can't.

alter table copy_versions
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references users (id) on delete set null;

create or replace function update_copy_version(p_version_id uuid, p_fields jsonb)
returns timestamptz
language plpgsql security definer set search_path = public, extensions as $$
declare
  v copy_versions;
  v_at timestamptz := now();
begin
  select * into v from copy_versions where id = p_version_id for update;
  if not found then
    raise exception 'This version no longer exists';
  end if;
  -- The team who can see the post, never a Client.
  if not can_see_creative_as_staff(v.creative_id) then
    raise exception 'Only the team can change a version';
  end if;
  if exists (select 1 from copy_versions where creative_id = v.creative_id and version_no > v.version_no) then
    raise exception 'Only the latest version can be changed';
  end if;
  -- Any comment on it, the team's own included, and a review link's.
  if exists (select 1 from comments where copy_version_id = v.id and deleted_at is null) then
    raise exception 'This version has comments, so save the changes as a new version';
  end if;
  update copy_versions
  set fields = coalesce(p_fields, '{}'::jsonb), edited_at = v_at, edited_by = auth.uid()
  where id = v.id;
  return v_at;
end;
$$;

revoke all on function update_copy_version(uuid, jsonb) from public, anon;
grant execute on function update_copy_version(uuid, jsonb) to authenticated;
