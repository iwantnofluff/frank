-- Phase 48 — client details are an Owner's or Admin's to change, and a
-- project's delivery never changes.
--
-- Decided directly (4 Oct 2026):
-- 1. The Client Profile edits its details in place, for Owners and Admins
--    only, matching the Project Profile (phase47). A User sees them read-
--    only. Users can still archive a client as before, so this guards the
--    detail columns rather than narrowing clients_update. No caller (the
--    service role) passes.
-- 2. A project stays Content Planner or Other Content once made, with or
--    without posts: switching brings too many complications. This replaces
--    the posts-only check (projects_delivery_immutable) in effect, for
--    every caller.

create or replace function clients_details_admin_only()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or is_agency_admin(new.agency_id) then
    return new;
  end if;
  if (new.name, new.industry, new.description, new.logo_asset_id)
     is distinct from (old.name, old.industry, old.description, old.logo_asset_id) then
    raise exception 'Only Owners and Admins can change a client''s details'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clients_details_admin_only
  before update of name, industry, description, logo_asset_id on clients
  for each row execute function clients_details_admin_only();

create or replace function projects_delivery_fixed()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.delivery is distinct from old.delivery then
    raise exception 'A project''s delivery can''t change once it''s made'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger projects_delivery_fixed
  before update of delivery on projects
  for each row execute function projects_delivery_fixed();
