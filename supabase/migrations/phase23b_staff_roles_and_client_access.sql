-- Phase 23b — four staff roles and per-client staff access restriction.
-- Run phase23a_add_role_enum_values.sql FIRST, as its own separate paste
-- in the SQL editor, and confirm it succeeds before running this one —
-- see that file's own header for why the two can't be one script.
--
-- Two independent things, both schema/RLS only (no invite flow or email
-- yet — that's a separate, later piece of this feature):
--
-- 1. agency_role now also has primary_owner and owner (added by
--    phase23a), with Owner defined (per direct instruction) as a strict
--    superset of Admin's powers, plus two owner-tier-only actions:
--    managing another Owner's membership, and (later, once agency-level
--    settings exist for it) billing. `finance` is left in place unused
--    rather than recreating the enum type for zero benefit.
--
-- 2. Staff access to a client is no longer unconditional. Primary
--    Owner/Owner/Admin still see every client in the agency — only the
--    "user" tier is restrictable, per direct instruction. A "user"-role
--    staff member instead sees only the clients explicitly listed in
--    the new staff_client_access table.
--
-- This touches nearly every client-scoped table's RLS, because
-- is_agency_staff(agency_id) was, until now, an unconditional grant used
-- as one half of an OR in every one of those policies — "staff sees
-- everything, client-side sees only their own client." The new
-- visible_client_ids() function folds both halves into one check: it
-- returns every client for unrestricted staff, only granted ones for a
-- restricted "user", and the caller's own client for a client-side
-- membership — so most policies below just swap their old two-branch OR
-- for one `... in (select visible_client_ids(agency_id))` check.
-- comments_select is the one exception that keeps a real branch, since
-- staff and client-side see a different SET of rows there (private vs.
-- public-only), not just a different client scope.
--
-- Left deliberately unchanged, and why:
--   - format_directions, ai_usage_events, calendar_views,
--     agency_knowledge_entries: no client dimension on these tables at
--     all (confirmed by reading each one's own table definition) —
--     restricting by client makes no sense for agency-wide data.
--   - users: still visible agency-wide to anyone sharing a membership —
--     names resolving on comments/briefs isn't client data either.
--   - storage.objects (phase8_storage.sql): that layer's own comment
--     already documents it as deliberately coarser than the table-level
--     check ("keep one agency's files unreadable to another agency's
--     members, full stop") and relies on the table layer — which this
--     migration fixes — for the fine-grained check. Not a gap this
--     migration introduces.
--   - clients_insert: creating a brand new client is left admin-tier
--     (is_unrestricted_staff), not opened up to a restricted "user" —
--     there's nothing yet to scope-check a brand-new row against, and
--     provisioning new accounts reads as an admin action rather than a
--     day-to-day one. Flagged here as a judgement call, not something
--     directly asked for either way.
--
-- Known gap this migration cannot close by itself: every agency that
-- exists before this runs has zero Primary Owner rows (the role didn't
-- exist until now), and the unique index below only enforces "at most
-- one," never "at least one." transfer_primary_ownership() requires an
-- existing Primary Owner to call it, so it can't bootstrap the first one
-- either. Whoever should hold it per existing agency needs a one-off,
-- manual `update memberships set role = 'primary_owner' where id = ...`
-- through the service-role client — deliberately not guessed at or
-- automated here, since nothing in this schema says which existing admin
-- should become which agency's Primary Owner.

-- ---------------------------------------------------------------------
-- 1. Role helper functions (before staff_client_access's own RLS below,
--    which reads is_unrestricted_staff). visible_client_ids comes after
--    that table, since its body reads it.
-- ---------------------------------------------------------------------

-- Admin's own existing call sites (agency settings, membership
-- management) are exactly the "Owner has every Admin power, plus more"
-- set per direct instruction — so this widens in place rather than
-- introducing a parallel "is_agency_admin_or_above" every one of those
-- policies would otherwise need switching to.
create or replace function is_agency_admin(check_agency_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where agency_id = check_agency_id
      and user_id = auth.uid()
      and role in ('admin', 'owner', 'primary_owner')
      and client_id is null
      and removed_at is null
      and accepted_at is not null
  );
$$;

-- The "plus more" half — actions only an Owner or the Primary Owner may
-- take (managing another Owner's own membership; a plain Admin can
-- manage everyone below that tier via is_agency_admin() above, but not
-- a peer/superior Owner).
create or replace function is_agency_owner_or_above(check_agency_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where agency_id = check_agency_id
      and user_id = auth.uid()
      and role in ('owner', 'primary_owner')
      and client_id is null
      and removed_at is null
      and accepted_at is not null
  );
$$;

-- Primary Owner/Owner/Admin see every client unconditionally — same
-- three roles is_agency_admin() above now covers.
create or replace function is_unrestricted_staff(check_agency_id uuid)
returns boolean
language sql security definer stable as $$
  select is_agency_admin(check_agency_id);
$$;

-- ---------------------------------------------------------------------
-- 2. staff_client_access — explicit per-client grants for "user"-role
--    staff. Only ever consulted for a membership with client_id null
--    (i.e. a staff membership) and role = 'user'.
-- ---------------------------------------------------------------------

create table staff_client_access (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id), -- denormalised from membership, for RLS
  membership_id uuid not null references memberships (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (membership_id, client_id)
);

create index staff_client_access_membership_idx on staff_client_access (membership_id);

create or replace function set_agency_id_from_membership()
returns trigger language plpgsql security definer as $$
begin
  select agency_id into strict new.agency_id from memberships where id = new.membership_id;
  return new;
end;
$$;

create trigger staff_client_access_set_agency_id
  before insert or update of membership_id on staff_client_access
  for each row execute function set_agency_id_from_membership();

-- Every client id the caller can see, staff or client-side, in one set —
-- replaces the "is_agency_staff(agency_id) or client_id in (select
-- current_client_ids(agency_id))" shape every client-scoped policy used
-- to repeat. A restricted "user" gets only their explicit grants; every
-- other staff role gets every client in the agency; a client-side
-- membership gets its own client, same as current_client_ids() always
-- returned. Defined here, after staff_client_access exists, because
-- Postgres resolves table references in a language-sql body at create
-- time.
create or replace function visible_client_ids(check_agency_id uuid)
returns setof uuid
language sql security definer stable as $$
  select id from clients
  where agency_id = check_agency_id
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
      or id in (select current_client_ids(check_agency_id))
    );
$$;

alter table staff_client_access enable row level security;

create policy staff_client_access_select on staff_client_access
  for select using (is_unrestricted_staff(agency_id));
create policy staff_client_access_insert on staff_client_access
  for insert with check (is_unrestricted_staff(agency_id));
create policy staff_client_access_delete on staff_client_access
  for delete using (is_unrestricted_staff(agency_id));

-- ---------------------------------------------------------------------
-- 3. Primary Owner invariant — at most one active Primary Owner per
--    agency, enforced by a unique index; "at least one" isn't
--    (Postgres can't cheaply express that as a constraint), but the
--    trigger below refuses any update that would leave an agency with
--    zero, so the only way to change who holds it going forward is
--    transfer_primary_ownership(), which demotes the old one and
--    promotes the new one in the same statement pair — set_config's
--    session flag is what lets that specific pair through the trigger
--    without it seeing the momentary zero in between.
-- ---------------------------------------------------------------------

create unique index one_primary_owner_per_agency
  on memberships (agency_id)
  where role = 'primary_owner' and removed_at is null;

create or replace function protect_last_primary_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_remaining int;
begin
  if current_setting('frank.ownership_transfer_in_progress', true) = 'true' then
    return new;
  end if;
  if old.role = 'primary_owner' and old.removed_at is null
     and (new.role is distinct from 'primary_owner' or new.removed_at is not null) then
    select count(*) into v_remaining
    from memberships
    where agency_id = old.agency_id
      and role = 'primary_owner'
      and removed_at is null
      and id <> old.id;
    if v_remaining = 0 then
      raise exception 'an agency must always have a Primary Owner — use transfer_primary_ownership() instead';
    end if;
  end if;
  return new;
end;
$$;

create trigger memberships_protect_last_primary_owner
  before update on memberships
  for each row execute function protect_last_primary_owner();

create or replace function transfer_primary_ownership(p_agency_id uuid, p_new_owner_membership_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from memberships
    where agency_id = p_agency_id and user_id = auth.uid()
      and role = 'primary_owner' and client_id is null
      and removed_at is null and accepted_at is not null
  ) then
    raise exception 'only the current Primary Owner can transfer ownership';
  end if;

  if not exists (
    select 1 from memberships
    where id = p_new_owner_membership_id and agency_id = p_agency_id
      and client_id is null and removed_at is null and accepted_at is not null
  ) then
    raise exception 'target membership not found in this agency';
  end if;

  perform set_config('frank.ownership_transfer_in_progress', 'true', true);
  update memberships set role = 'owner'
  where agency_id = p_agency_id and role = 'primary_owner' and removed_at is null;
  update memberships set role = 'primary_owner' where id = p_new_owner_membership_id;
  perform set_config('frank.ownership_transfer_in_progress', 'false', true);
end;
$$;

grant execute on function transfer_primary_ownership(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. memberships — Admin manages everyone below Owner tier; only an
--    Owner/Primary Owner can insert, update or remove another Owner's
--    membership. role = 'primary_owner' can never be set by a plain
--    insert/update at all — only transfer_primary_ownership() (via the
--    session flag above) ever assigns it.
-- ---------------------------------------------------------------------

drop policy memberships_insert on memberships;
create policy memberships_insert on memberships
  for insert with check (
    is_agency_admin(agency_id)
    and role <> 'primary_owner'
    and (role <> 'owner' or is_agency_owner_or_above(agency_id))
  );
drop policy memberships_update on memberships;
create policy memberships_update on memberships
  for update
  using (
    is_agency_admin(agency_id)
    and (role <> 'owner' or is_agency_owner_or_above(agency_id))
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
    and (role <> 'owner' or is_agency_owner_or_above(agency_id))
  );

-- ---------------------------------------------------------------------
-- 5. Rewritten policies — clients/projects (direct client_id)
-- ---------------------------------------------------------------------

drop policy clients_select on clients;
create policy clients_select on clients
  for select using (
    agency_id in (select current_agency_ids())
    and id in (select visible_client_ids(agency_id))
  );
drop policy clients_insert on clients;
create policy clients_insert on clients
  for insert with check (is_unrestricted_staff(agency_id));
drop policy clients_update on clients;
create policy clients_update on clients
  for update using (
    agency_id in (select current_agency_ids())
    and id in (select visible_client_ids(agency_id))
  );

drop policy projects_select on projects;
create policy projects_select on projects
  for select using (
    agency_id in (select current_agency_ids())
    and client_id in (select visible_client_ids(agency_id))
  );
drop policy projects_insert on projects;
create policy projects_insert on projects
  for insert with check (client_id in (select visible_client_ids(agency_id)));
drop policy projects_update on projects;
create policy projects_update on projects
  for update using (
    agency_id in (select current_agency_ids())
    and client_id in (select visible_client_ids(agency_id))
  );

-- ---------------------------------------------------------------------
-- 6. Rewritten policies — one join through projects
-- ---------------------------------------------------------------------

drop policy creatives_select on creatives;
create policy creatives_select on creatives
  for select using (
    agency_id in (select current_agency_ids())
    and exists (
      select 1 from projects
      where projects.id = creatives.project_id
        and projects.client_id in (select visible_client_ids(creatives.agency_id))
    )
  );
drop policy creatives_insert on creatives;
create policy creatives_insert on creatives
  for insert with check (
    exists (
      select 1 from projects
      where projects.id = creatives.project_id
        and projects.client_id in (select visible_client_ids(creatives.agency_id))
    )
  );
drop policy creatives_update on creatives;
create policy creatives_update on creatives
  for update using (
    agency_id in (select current_agency_ids())
    and exists (
      select 1 from projects
      where projects.id = creatives.project_id
        and projects.client_id in (select visible_client_ids(creatives.agency_id))
    )
  );

drop policy custom_columns_select on custom_columns;
create policy custom_columns_select on custom_columns
  for select using (
    agency_id in (select current_agency_ids())
    and exists (
      select 1 from projects
      where projects.id = custom_columns.project_id
        and projects.client_id in (select visible_client_ids(custom_columns.agency_id))
    )
  );
drop policy custom_columns_insert on custom_columns;
create policy custom_columns_insert on custom_columns
  for insert with check (
    exists (
      select 1 from projects
      where projects.id = custom_columns.project_id
        and projects.client_id in (select visible_client_ids(custom_columns.agency_id))
    )
  );
drop policy custom_columns_update on custom_columns;
create policy custom_columns_update on custom_columns
  for update using (
    exists (
      select 1 from projects
      where projects.id = custom_columns.project_id
        and projects.client_id in (select visible_client_ids(custom_columns.agency_id))
    )
  );
drop policy custom_columns_delete on custom_columns;
create policy custom_columns_delete on custom_columns
  for delete using (
    exists (
      select 1 from projects
      where projects.id = custom_columns.project_id
        and projects.client_id in (select visible_client_ids(custom_columns.agency_id))
    )
  );

drop policy shared_links_select on shared_links;
create policy shared_links_select on shared_links
  for select using (
    exists (
      select 1 from projects
      where projects.id = shared_links.project_id
        and projects.client_id in (select visible_client_ids(shared_links.agency_id))
    )
  );
drop policy shared_links_insert on shared_links;
create policy shared_links_insert on shared_links
  for insert with check (
    exists (
      select 1 from projects
      where projects.id = shared_links.project_id
        and projects.client_id in (select visible_client_ids(shared_links.agency_id))
    )
  );
drop policy shared_links_update on shared_links;
create policy shared_links_update on shared_links
  for update using (
    exists (
      select 1 from projects
      where projects.id = shared_links.project_id
        and projects.client_id in (select visible_client_ids(shared_links.agency_id))
    )
  );

-- ---------------------------------------------------------------------
-- 7. Rewritten policies — two joins through creatives/projects
-- ---------------------------------------------------------------------

drop policy creative_versions_select on creative_versions;
create policy creative_versions_select on creative_versions
  for select using (
    agency_id in (select current_agency_ids())
    and exists (
      select 1 from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = creative_versions.creative_id
        and projects.client_id in (select visible_client_ids(creative_versions.agency_id))
    )
  );
drop policy creative_versions_insert on creative_versions;
create policy creative_versions_insert on creative_versions
  for insert with check (
    exists (
      select 1 from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = creative_versions.creative_id
        and projects.client_id in (select visible_client_ids(creative_versions.agency_id))
    )
  );

drop policy copy_versions_select on copy_versions;
create policy copy_versions_select on copy_versions
  for select using (
    agency_id in (select current_agency_ids())
    and exists (
      select 1 from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = copy_versions.creative_id
        and projects.client_id in (select visible_client_ids(copy_versions.agency_id))
    )
  );
drop policy copy_versions_insert on copy_versions;
create policy copy_versions_insert on copy_versions
  for insert with check (
    exists (
      select 1 from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = copy_versions.creative_id
        and projects.client_id in (select visible_client_ids(copy_versions.agency_id))
    )
  );

-- comments_select keeps a real branch (unlike every policy above, this
-- one shows a genuinely different SET of rows to staff vs. client-side —
-- private comments included for the former, excluded for the latter —
-- so it can't collapse into a single visible_client_ids check the way
-- the others did).
drop policy comments_select on comments;
create policy comments_select on comments
  for select using (
    agency_id in (select current_agency_ids())
    and (
      exists (
        select 1 from creatives
        join projects on projects.id = creatives.project_id
        where creatives.id = comments.creative_id
          and projects.client_id in (select visible_client_ids(comments.agency_id))
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
drop policy comments_insert on comments;
create policy comments_insert on comments
  for insert with check (
    agency_id in (select current_agency_ids())
    and exists (
      select 1 from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = comments.creative_id
        and projects.client_id in (select visible_client_ids(comments.agency_id))
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
        and projects.client_id in (select visible_client_ids(comments.agency_id))
    )
  );

drop policy assets_select on assets;
create policy assets_select on assets
  for select using (
    agency_id in (select current_agency_ids())
    and (
      exists (
        select 1 from creative_versions
        join creatives on creatives.id = creative_versions.creative_id
        join projects on projects.id = creatives.project_id
        where creative_versions.asset_id = assets.id
          and projects.client_id in (select visible_client_ids(assets.agency_id))
      )
      or exists (
        select 1 from clients
        where clients.logo_asset_id = assets.id
          and clients.id in (select visible_client_ids(assets.agency_id))
      )
    )
  );

-- ---------------------------------------------------------------------
-- 8. Rewritten policies — direct client_id, no project join
-- ---------------------------------------------------------------------

drop policy knowledge_entries_select on knowledge_entries;
create policy knowledge_entries_select on knowledge_entries
  for select using (
    agency_id in (select current_agency_ids())
    and client_id in (select visible_client_ids(agency_id))
  );
drop policy knowledge_entries_insert on knowledge_entries;
create policy knowledge_entries_insert on knowledge_entries
  for insert with check (client_id in (select visible_client_ids(agency_id)));
drop policy knowledge_entries_update on knowledge_entries;
create policy knowledge_entries_update on knowledge_entries
  for update using (client_id in (select visible_client_ids(agency_id)));
drop policy knowledge_entries_delete on knowledge_entries;
create policy knowledge_entries_delete on knowledge_entries
  for delete using (client_id in (select visible_client_ids(agency_id)));

drop policy client_contacts_select on client_contacts;
create policy client_contacts_select on client_contacts
  for select using (
    agency_id in (select current_agency_ids())
    and client_id in (select visible_client_ids(agency_id))
  );
drop policy client_contacts_insert on client_contacts;
create policy client_contacts_insert on client_contacts
  for insert with check (client_id in (select visible_client_ids(agency_id)));
drop policy client_contacts_update on client_contacts;
create policy client_contacts_update on client_contacts
  for update using (client_id in (select visible_client_ids(agency_id)));
drop policy client_contacts_delete on client_contacts;
create policy client_contacts_delete on client_contacts
  for delete using (client_id in (select visible_client_ids(agency_id)));

drop policy project_folders_select on project_folders;
create policy project_folders_select on project_folders
  for select using (
    agency_id in (select current_agency_ids())
    and client_id in (select visible_client_ids(agency_id))
  );
drop policy project_folders_insert on project_folders;
create policy project_folders_insert on project_folders
  for insert with check (client_id in (select visible_client_ids(agency_id)));
drop policy project_folders_update on project_folders;
create policy project_folders_update on project_folders
  for update using (client_id in (select visible_client_ids(agency_id)));
drop policy project_folders_delete on project_folders;
create policy project_folders_delete on project_folders
  for delete using (client_id in (select visible_client_ids(agency_id)));

-- ---------------------------------------------------------------------
-- 9. delete_creatives_permanently — respect the same restriction
--     rather than letting a restricted "user" purge a client they can't
--     even see (the RLS above already blocks reaching this creative
--     through the app's own UI, but the function itself is SECURITY
--     DEFINER and bypasses RLS, so it needs its own check).
-- ---------------------------------------------------------------------

create or replace function delete_creatives_permanently(p_creative_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_agency_id uuid;
begin
  if p_creative_ids is null or array_length(p_creative_ids, 1) is null then
    return;
  end if;

  select agency_id into v_agency_id
  from creatives
  where id = any(p_creative_ids)
  limit 1;

  if v_agency_id is null then
    raise exception 'no matching creatives found';
  end if;

  if not is_agency_staff(v_agency_id) then
    raise exception 'not permitted';
  end if;

  if exists (
    select 1 from creatives
    where id = any(p_creative_ids) and agency_id <> v_agency_id
  ) then
    raise exception 'creatives span more than one agency';
  end if;

  if exists (
    select 1 from creatives cr
    join projects p on p.id = cr.project_id
    where cr.id = any(p_creative_ids)
      and p.client_id not in (select visible_client_ids(v_agency_id))
  ) then
    raise exception 'not permitted for one or more of these creatives'' clients';
  end if;

  update comments set copy_version_id = null, creative_version_id = null
  where creative_id = any(p_creative_ids);
  update copy_versions set source_comment_id = null
  where creative_id = any(p_creative_ids);

  delete from comments where creative_id = any(p_creative_ids);
  delete from copy_versions where creative_id = any(p_creative_ids);
  delete from creative_versions where creative_id = any(p_creative_ids);
  delete from shared_links where creative_id = any(p_creative_ids);
  delete from creatives where id = any(p_creative_ids);
end;
$$;
