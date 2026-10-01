-- Phase 23c — corrects phase23b. Run after phase23b, as its own paste.
--
-- phase23b swapped every `is_agency_staff(agency_id)` for
-- `visible_client_ids(agency_id)`, on the assumption the original
-- policies differed between staff and client-side only in scope. They
-- didn't: almost every write (and shared_links entirely) was staff-only,
-- and visible_client_ids also returns a client-side member's own client.
-- Found by a real-session test, not by reading the policies: a
-- client-side member could see private comments, and by the same shape
-- create projects, edit creatives, and read shared links.
--
-- staff_visible_client_ids() below is the staff-only half — the clients a
-- *staff* member may act on (all of them for Primary Owner/Owner/Admin,
-- only granted ones for a restricted User, none for a client-side
-- member). Every policy that was staff-only before phase23b now uses it;
-- the reads that genuinely allowed client-side access (and
-- copy_versions_insert/comments_insert, which did too) keep
-- visible_client_ids.
--
-- Also here:
--   - assets_select goes back to phase11's exact definition. phase23b
--     dropped its unconditional staff branch, which hid agency-level
--     knowledge files and freshly uploaded (not yet linked) assets from
--     staff. Asset rows carry no client, and storage.objects is already
--     agency-wide for staff, so a restricted User can still see asset
--     metadata agency-wide — recorded in docs/parity-gaps.md.
--   - memberships_update/delete no longer reach the Primary Owner's row
--     (an Owner could delete it outright: the last-Primary-Owner trigger
--     only fires on update, never delete).
--   - advance_creative_stage() checks the creative's client is one the
--     caller may act on, the same way phase23b did for
--     delete_creatives_permanently().

create or replace function staff_visible_client_ids(check_agency_id uuid)
returns setof uuid
language sql security definer stable as $$
  select id from clients
  where agency_id = check_agency_id
    and is_agency_staff(check_agency_id)
    and (
      is_unrestricted_staff(check_agency_id)
      or id in (
        select sca.client_id
        from staff_client_access sca
        join memberships m on m.id = sca.membership_id
        where m.user_id = auth.uid()
          and m.agency_id = check_agency_id
          and m.client_id is null
          and m.removed_at is null
          and m.accepted_at is not null
          and m.role = 'user'
      )
    );
$$;

-- ---------------------------------------------------------------------
-- memberships — the Primary Owner's row is off limits to everyone but
-- transfer_primary_ownership().
-- ---------------------------------------------------------------------

drop policy memberships_update on memberships;
create policy memberships_update on memberships
  for update
  using (
    current_setting('frank.ownership_transfer_in_progress', true) = 'true'
    or (
      is_agency_admin(agency_id)
      and role <> 'primary_owner'
      and (role <> 'owner' or is_agency_owner_or_above(agency_id))
    )
  )
  with check (
    current_setting('frank.ownership_transfer_in_progress', true) = 'true'
    or (
      is_agency_admin(agency_id)
      and role <> 'primary_owner'
      and (role <> 'owner' or is_agency_owner_or_above(agency_id))
    )
  );
drop policy memberships_delete on memberships;
create policy memberships_delete on memberships
  for delete using (
    is_agency_admin(agency_id)
    and role <> 'primary_owner'
    and (role <> 'owner' or is_agency_owner_or_above(agency_id))
  );

-- ---------------------------------------------------------------------
-- clients / projects
-- ---------------------------------------------------------------------

drop policy clients_update on clients;
create policy clients_update on clients
  for update using (id in (select staff_visible_client_ids(agency_id)));

drop policy projects_insert on projects;
create policy projects_insert on projects
  for insert with check (client_id in (select staff_visible_client_ids(agency_id)));
drop policy projects_update on projects;
create policy projects_update on projects
  for update using (client_id in (select staff_visible_client_ids(agency_id)));

-- ---------------------------------------------------------------------
-- one join through projects
-- ---------------------------------------------------------------------

drop policy creatives_insert on creatives;
create policy creatives_insert on creatives
  for insert with check (
    exists (
      select 1 from projects
      where projects.id = creatives.project_id
        and projects.client_id in (select staff_visible_client_ids(creatives.agency_id))
    )
  );
drop policy creatives_update on creatives;
create policy creatives_update on creatives
  for update using (
    exists (
      select 1 from projects
      where projects.id = creatives.project_id
        and projects.client_id in (select staff_visible_client_ids(creatives.agency_id))
    )
  );

drop policy custom_columns_insert on custom_columns;
create policy custom_columns_insert on custom_columns
  for insert with check (
    exists (
      select 1 from projects
      where projects.id = custom_columns.project_id
        and projects.client_id in (select staff_visible_client_ids(custom_columns.agency_id))
    )
  );
drop policy custom_columns_update on custom_columns;
create policy custom_columns_update on custom_columns
  for update using (
    exists (
      select 1 from projects
      where projects.id = custom_columns.project_id
        and projects.client_id in (select staff_visible_client_ids(custom_columns.agency_id))
    )
  );
drop policy custom_columns_delete on custom_columns;
create policy custom_columns_delete on custom_columns
  for delete using (
    exists (
      select 1 from projects
      where projects.id = custom_columns.project_id
        and projects.client_id in (select staff_visible_client_ids(custom_columns.agency_id))
    )
  );

drop policy shared_links_select on shared_links;
create policy shared_links_select on shared_links
  for select using (
    exists (
      select 1 from projects
      where projects.id = shared_links.project_id
        and projects.client_id in (select staff_visible_client_ids(shared_links.agency_id))
    )
  );
drop policy shared_links_insert on shared_links;
create policy shared_links_insert on shared_links
  for insert with check (
    exists (
      select 1 from projects
      where projects.id = shared_links.project_id
        and projects.client_id in (select staff_visible_client_ids(shared_links.agency_id))
    )
  );
drop policy shared_links_update on shared_links;
create policy shared_links_update on shared_links
  for update using (
    exists (
      select 1 from projects
      where projects.id = shared_links.project_id
        and projects.client_id in (select staff_visible_client_ids(shared_links.agency_id))
    )
  );

-- ---------------------------------------------------------------------
-- two joins through creatives/projects
-- ---------------------------------------------------------------------

drop policy creative_versions_insert on creative_versions;
create policy creative_versions_insert on creative_versions
  for insert with check (
    exists (
      select 1 from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = creative_versions.creative_id
        and projects.client_id in (select staff_visible_client_ids(creative_versions.agency_id))
    )
  );

drop policy comments_select on comments;
create policy comments_select on comments
  for select using (
    agency_id in (select current_agency_ids())
    and (
      exists (
        select 1 from creatives
        join projects on projects.id = creatives.project_id
        where creatives.id = comments.creative_id
          and projects.client_id in (select staff_visible_client_ids(comments.agency_id))
      )
      or (
        visibility = 'public'
        and exists (
          select 1 from creatives
          join projects on projects.id = creatives.project_id
          where creatives.id = comments.creative_id
            and projects.client_id in (select current_client_ids(comments.agency_id))
        )
      )
    )
  );
drop policy comments_update_own on comments;
create policy comments_update_own on comments
  for update using (
    author_id = auth.uid()
    or exists (
      select 1 from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = comments.creative_id
        and projects.client_id in (select staff_visible_client_ids(comments.agency_id))
    )
  );

drop policy assets_select on assets;
create policy assets_select on assets
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or exists (
        select 1 from creative_versions
        join creatives on creatives.id = creative_versions.creative_id
        join projects on projects.id = creatives.project_id
        where creative_versions.asset_id = assets.id
          and projects.client_id in (select current_client_ids(assets.agency_id))
      )
      or exists (
        select 1 from clients
        where clients.logo_asset_id = assets.id
          and clients.id in (select current_client_ids(assets.agency_id))
      )
      or exists (
        select 1 from knowledge_entries
        where knowledge_entries.asset_id = assets.id
          and knowledge_entries.client_id in (select current_client_ids(assets.agency_id))
      )
    )
  );

-- ---------------------------------------------------------------------
-- direct client_id
-- ---------------------------------------------------------------------

drop policy knowledge_entries_insert on knowledge_entries;
create policy knowledge_entries_insert on knowledge_entries
  for insert with check (client_id in (select staff_visible_client_ids(agency_id)));
drop policy knowledge_entries_update on knowledge_entries;
create policy knowledge_entries_update on knowledge_entries
  for update using (client_id in (select staff_visible_client_ids(agency_id)));
drop policy knowledge_entries_delete on knowledge_entries;
create policy knowledge_entries_delete on knowledge_entries
  for delete using (client_id in (select staff_visible_client_ids(agency_id)));

drop policy client_contacts_insert on client_contacts;
create policy client_contacts_insert on client_contacts
  for insert with check (client_id in (select staff_visible_client_ids(agency_id)));
drop policy client_contacts_update on client_contacts;
create policy client_contacts_update on client_contacts
  for update using (client_id in (select staff_visible_client_ids(agency_id)));
drop policy client_contacts_delete on client_contacts;
create policy client_contacts_delete on client_contacts
  for delete using (client_id in (select staff_visible_client_ids(agency_id)));

drop policy project_folders_insert on project_folders;
create policy project_folders_insert on project_folders
  for insert with check (client_id in (select staff_visible_client_ids(agency_id)));
drop policy project_folders_update on project_folders;
create policy project_folders_update on project_folders
  for update using (client_id in (select staff_visible_client_ids(agency_id)));
drop policy project_folders_delete on project_folders;
create policy project_folders_delete on project_folders
  for delete using (client_id in (select staff_visible_client_ids(agency_id)));

-- ---------------------------------------------------------------------
-- advance_creative_stage — phase13's body, plus the client check.
-- ---------------------------------------------------------------------

create or replace function advance_creative_stage(p_creative_id uuid, p_direction text)
returns creatives
language plpgsql security definer set search_path = public as $$
declare
  v_creative creatives%rowtype;
begin
  select * into v_creative from creatives where id = p_creative_id;
  if not found then
    raise exception 'creative not found';
  end if;
  if not is_agency_staff(v_creative.agency_id) then
    raise exception 'not permitted';
  end if;
  if not exists (
    select 1 from projects
    where projects.id = v_creative.project_id
      and projects.client_id in (select staff_visible_client_ids(v_creative.agency_id))
  ) then
    raise exception 'not permitted for this creative''s client';
  end if;

  if p_direction = 'to_internal' then
    if v_creative.stage = 2 then
      raise exception 'already at Internal Review';
    end if;
    update creatives
    set stage = 2, approved_at = null, approved_by_name = null, approved_by_email = null
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_review' then
    if v_creative.stage = 3 then
      raise exception 'already at Client Review';
    end if;
    update creatives
    set stage = 3, approved_at = null, approved_by_name = null, approved_by_email = null
    where id = p_creative_id
    returning * into v_creative;
  elsif p_direction = 'to_approved' then
    if v_creative.stage = 4 then
      raise exception 'already approved';
    end if;
    update creatives
    set stage = 4,
        exception = null,
        approved_at = now(),
        approved_by_name = (select name from users where id = auth.uid()),
        approved_by_email = (select email from users where id = auth.uid())
    where id = p_creative_id
    returning * into v_creative;
  else
    raise exception 'unknown direction: %', p_direction;
  end if;

  return v_creative;
end;
$$;
