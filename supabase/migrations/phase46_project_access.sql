-- Phase 46 — access by project, not just by client.
--
-- Decided directly (4 Oct 2026), replacing "per client" (phase23b/44):
-- a User or a Client sees only the projects they're on. The Primary Owner,
-- Owners and Admins still see every project. Someone on a client is on all
-- its projects unless taken off one; a new project starts with everyone on
-- its client (decided directly). Nobody loses anything today: every User
-- and Client is put on every project of the clients they already see.
--
-- Client-level things — the client itself, its knowledge, folders and
-- review contacts — stay client-level (staff_client_access, a Client's
-- membership). project_access narrows within that.

-- 1. Who's on which project. Only Users and Clients have rows; Owners and
--    Admins see everything regardless.
create table project_access (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  membership_id uuid not null references memberships (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (membership_id, project_id)
);
create index project_access_project_idx on project_access (project_id);
create trigger project_access_set_agency_id
  before insert or update of project_id on project_access
  for each row execute function set_agency_id_from_project();
create trigger zz_read_only_guard before insert or update or delete on project_access
  for each row execute function block_writes_when_read_only();

-- A membership can only be on projects of a client it's on.
create or replace function membership_is_on_client(p_membership_id uuid, p_client_id uuid)
returns boolean
language sql security definer stable set search_path = public, extensions as $$
  select exists (
    select 1 from memberships m
    where m.id = p_membership_id
      and (
        m.client_id = p_client_id
        or (
          m.client_id is null and m.role = 'user'
          and exists (select 1 from staff_client_access s where s.membership_id = m.id and s.client_id = p_client_id)
        )
      )
  );
$$;

alter table project_access enable row level security;
create policy project_access_select on project_access
  for select using (
    is_unrestricted_staff(agency_id)
    or membership_id in (select id from memberships where user_id = auth.uid())
  );
-- The Primary Owner, Owners and Admins add or take people off a project
-- (decided directly).
create policy project_access_insert on project_access
  for insert with check (
    is_agency_admin(agency_id)
    and membership_is_on_client(membership_id, (select client_id from projects where id = project_id))
  );
create policy project_access_delete on project_access
  for delete using (is_agency_admin(agency_id));

-- 2. The projects the caller is on, and the project-level counterparts of
--    the client helpers (phase23b) every project-scoped rule now calls.
create or replace function my_project_ids(check_agency_id uuid)
returns setof uuid
language sql security definer stable set search_path = public, extensions as $$
  select pa.project_id
  from project_access pa
  join memberships m on m.id = pa.membership_id
  where m.user_id = auth.uid()
    and m.agency_id = check_agency_id
    and m.removed_at is null
    and m.accepted_at is not null
    and in_request_agency(m.agency_id);
$$;

create or replace function visible_project_ids(check_agency_id uuid)
returns setof uuid
language sql security definer stable set search_path = public, extensions as $$
  select p.id from projects p
  where p.agency_id = check_agency_id
    and p.client_id in (select visible_client_ids(check_agency_id))
    and (is_unrestricted_staff(check_agency_id) or p.id in (select my_project_ids(check_agency_id)));
$$;

create or replace function staff_visible_project_ids(check_agency_id uuid)
returns setof uuid
language sql security definer stable set search_path = public, extensions as $$
  select p.id from projects p
  where p.agency_id = check_agency_id
    and p.client_id in (select staff_visible_client_ids(check_agency_id))
    and (is_unrestricted_staff(check_agency_id) or p.id in (select my_project_ids(check_agency_id)));
$$;

-- A Client's projects: of their client, and on them.
create or replace function client_project_ids(check_agency_id uuid)
returns setof uuid
language sql security definer stable set search_path = public, extensions as $$
  select p.id from projects p
  where p.client_id in (select current_client_ids(check_agency_id))
    and p.id in (select my_project_ids(check_agency_id));
$$;

-- 3. Keeping it in step.
-- Someone given a client (a User's grant, or a Client's membership) is on
-- all its projects; taken off the client, off them all.
create or replace function project_access_from_client_grant()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'DELETE' then
    delete from project_access pa using projects p
    where pa.membership_id = old.membership_id and p.id = pa.project_id and p.client_id = old.client_id;
    return old;
  end if;
  insert into project_access (membership_id, project_id)
  select new.membership_id, p.id from projects p where p.client_id = new.client_id
  on conflict (membership_id, project_id) do nothing;
  return new;
end;
$$;
create trigger project_access_from_client_grant
  after insert or delete on staff_client_access
  for each row execute function project_access_from_client_grant();

create or replace function project_access_from_client_membership()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.client_id is null then return new; end if;
  insert into project_access (membership_id, project_id)
  select new.id, p.id from projects p where p.client_id = new.client_id
  on conflict (membership_id, project_id) do nothing;
  return new;
end;
$$;
create trigger project_access_from_client_membership
  after insert on memberships
  for each row execute function project_access_from_client_membership();

-- A new project starts with everyone on its client; a project moved to
-- another client (phase27) takes the new client's people instead.
create or replace function project_access_for_project()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'UPDATE' then
    if new.client_id = old.client_id then return new; end if;
    delete from project_access where project_id = new.id;
  end if;
  insert into project_access (membership_id, project_id)
  select m.id, new.id from memberships m
  where m.agency_id = new.agency_id and m.removed_at is null
    and (
      m.client_id = new.client_id
      or (
        m.client_id is null and m.role = 'user'
        and exists (select 1 from staff_client_access s where s.membership_id = m.id and s.client_id = new.client_id)
      )
    )
  on conflict (membership_id, project_id) do nothing;
  return new;
end;
$$;
create trigger project_access_for_project
  after insert or update of client_id on projects
  for each row execute function project_access_for_project();

-- 4. Nobody loses anything: every User and Client on every project of the
--    clients they're on now.
insert into project_access (membership_id, project_id)
select s.membership_id, p.id
from staff_client_access s join projects p on p.client_id = s.client_id
on conflict (membership_id, project_id) do nothing;
insert into project_access (membership_id, project_id)
select m.id, p.id
from memberships m join projects p on p.client_id = m.client_id
where m.client_id is not null
on conflict (membership_id, project_id) do nothing;

-- 5. What a project is for (the Project Profile, decided directly).
alter table projects add column description text check (char_length(description) <= 1000);

-- 6. Every project-scoped rule, from "a client you can see" to "a project
--    you can see" (generated from each rule's own text, unchanged
--    otherwise). Creating a project stays a matter of the client.
drop policy assets_select on assets;
create policy assets_select on assets
  as permissive for select to public
  using (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids)) AND (is_agency_staff(agency_id) OR (EXISTS ( SELECT 1
   FROM ((creative_versions
     JOIN creatives ON ((creatives.id = creative_versions.creative_id)))
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creative_versions.asset_id = assets.id) AND (projects.id IN ( SELECT client_project_ids(assets.agency_id)))))) OR (EXISTS ( SELECT 1
   FROM (((creative_version_slides s
     JOIN creative_versions cv ON ((cv.id = s.creative_version_id)))
     JOIN creatives ON ((creatives.id = cv.creative_id)))
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((s.asset_id = assets.id) AND (projects.id IN ( SELECT client_project_ids(assets.agency_id)))))) OR (EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.logo_asset_id = assets.id) AND (clients.id IN ( SELECT current_client_ids(assets.agency_id) AS current_client_ids))))) OR (EXISTS ( SELECT 1
   FROM knowledge_entries
  WHERE ((knowledge_entries.asset_id = assets.id) AND (knowledge_entries.client_id IN ( SELECT current_client_ids(assets.agency_id) AS current_client_ids))))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE (users.avatar_asset_id = assets.id))) OR (EXISTS ( SELECT 1
   FROM agency_settings
  WHERE ((agency_settings.logo_asset_id = assets.id) AND (agency_settings.agency_id = assets.agency_id)))))));

drop policy comments_insert on comments;
create policy comments_insert on comments
  as permissive for insert to public
  with check (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids)) AND (EXISTS ( SELECT 1
   FROM (creatives
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creatives.id = comments.creative_id) AND (projects.id IN ( SELECT visible_project_ids(comments.agency_id))))))));

drop policy comments_select on comments;
create policy comments_select on comments
  as permissive for select to public
  using (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids)) AND ((EXISTS ( SELECT 1
   FROM (creatives
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creatives.id = comments.creative_id) AND (projects.id IN ( SELECT staff_visible_project_ids(comments.agency_id)))))) OR ((visibility = 'public'::comment_visibility) AND (EXISTS ( SELECT 1
   FROM (creatives
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creatives.id = comments.creative_id) AND (projects.id IN ( SELECT client_project_ids(comments.agency_id))))))))));

drop policy comments_update_own on comments;
create policy comments_update_own on comments
  as permissive for update to public
  using (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (creatives
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creatives.id = comments.creative_id) AND (projects.id IN ( SELECT staff_visible_project_ids(comments.agency_id))))))));

drop policy copy_versions_insert on copy_versions;
create policy copy_versions_insert on copy_versions
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM (creatives
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creatives.id = copy_versions.creative_id) AND (projects.id IN ( SELECT visible_project_ids(copy_versions.agency_id)))))));

drop policy copy_versions_select on copy_versions;
create policy copy_versions_select on copy_versions
  as permissive for select to public
  using (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids)) AND (EXISTS ( SELECT 1
   FROM (creatives
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creatives.id = copy_versions.creative_id) AND (projects.id IN ( SELECT visible_project_ids(copy_versions.agency_id))))))));

drop policy creative_version_slides_insert on creative_version_slides;
create policy creative_version_slides_insert on creative_version_slides
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM ((creative_versions cv
     JOIN creatives c ON ((c.id = cv.creative_id)))
     JOIN projects p ON ((p.id = c.project_id)))
  WHERE ((cv.id = creative_version_slides.creative_version_id) AND (p.id IN ( SELECT staff_visible_project_ids(creative_version_slides.agency_id)))))));

drop policy creative_version_slides_select on creative_version_slides;
create policy creative_version_slides_select on creative_version_slides
  as permissive for select to public
  using (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids)) AND (EXISTS ( SELECT 1
   FROM ((creative_versions cv
     JOIN creatives c ON ((c.id = cv.creative_id)))
     JOIN projects p ON ((p.id = c.project_id)))
  WHERE ((cv.id = creative_version_slides.creative_version_id) AND (p.id IN ( SELECT visible_project_ids(creative_version_slides.agency_id))))))));

drop policy creative_versions_insert on creative_versions;
create policy creative_versions_insert on creative_versions
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM (creatives
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creatives.id = creative_versions.creative_id) AND (projects.id IN ( SELECT staff_visible_project_ids(creative_versions.agency_id)))))));

drop policy creative_versions_select on creative_versions;
create policy creative_versions_select on creative_versions
  as permissive for select to public
  using (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids)) AND (EXISTS ( SELECT 1
   FROM (creatives
     JOIN projects ON ((projects.id = creatives.project_id)))
  WHERE ((creatives.id = creative_versions.creative_id) AND (projects.id IN ( SELECT visible_project_ids(creative_versions.agency_id))))))));

drop policy creatives_insert on creatives;
create policy creatives_insert on creatives
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = creatives.project_id) AND (projects.id IN ( SELECT staff_visible_project_ids(creatives.agency_id)))))));

drop policy creatives_select on creatives;
create policy creatives_select on creatives
  as permissive for select to public
  using (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids)) AND (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = creatives.project_id) AND (projects.id IN ( SELECT visible_project_ids(creatives.agency_id))))))));

drop policy creatives_update on creatives;
create policy creatives_update on creatives
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = creatives.project_id) AND (projects.id IN ( SELECT staff_visible_project_ids(creatives.agency_id)))))));

drop policy custom_columns_delete on custom_columns;
create policy custom_columns_delete on custom_columns
  as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = custom_columns.project_id) AND (projects.id IN ( SELECT staff_visible_project_ids(custom_columns.agency_id)))))));

drop policy custom_columns_insert on custom_columns;
create policy custom_columns_insert on custom_columns
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = custom_columns.project_id) AND (projects.id IN ( SELECT staff_visible_project_ids(custom_columns.agency_id)))))));

drop policy custom_columns_select on custom_columns;
create policy custom_columns_select on custom_columns
  as permissive for select to public
  using (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids)) AND (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = custom_columns.project_id) AND (projects.id IN ( SELECT visible_project_ids(custom_columns.agency_id))))))));

drop policy custom_columns_update on custom_columns;
create policy custom_columns_update on custom_columns
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = custom_columns.project_id) AND (projects.id IN ( SELECT staff_visible_project_ids(custom_columns.agency_id)))))));

drop policy projects_select on projects;
-- Judged from the row itself, not by looking the project up
-- (visible_project_ids): a row just inserted isn't visible to that lookup
-- while its own insert is checked, which refused an Owner creating one.
create policy projects_select on projects
  as permissive for select to public
  using (((agency_id IN ( SELECT current_agency_ids() AS current_agency_ids))
    AND (client_id IN ( SELECT visible_client_ids(projects.agency_id)))
    AND (is_unrestricted_staff(agency_id) OR (id IN ( SELECT my_project_ids(projects.agency_id))))));

drop policy projects_update on projects;
create policy projects_update on projects
  as permissive for update to public
  using ((id IN ( SELECT staff_visible_project_ids(projects.agency_id))));

drop policy shared_links_insert on shared_links;
create policy shared_links_insert on shared_links
  as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = shared_links.project_id) AND (projects.id IN ( SELECT staff_visible_project_ids(shared_links.agency_id)))))));

drop policy shared_links_select on shared_links;
create policy shared_links_select on shared_links
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = shared_links.project_id) AND (projects.id IN ( SELECT staff_visible_project_ids(shared_links.agency_id)))))));

drop policy shared_links_update on shared_links;
create policy shared_links_update on shared_links
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = shared_links.project_id) AND (projects.id IN ( SELECT staff_visible_project_ids(shared_links.agency_id)))))));

-- 7. The functions that checked the client themselves (phase9, 21, 30, 33).

CREATE OR REPLACE FUNCTION public.advance_creative_stage(p_creative_id uuid, p_direction text)
 RETURNS creatives
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and projects.id in (select staff_visible_project_ids(v_creative.agency_id))
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_creatives_permanently(p_creative_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and p.id not in (select visible_project_ids(v_agency_id))
  ) then
    raise exception 'not permitted for one or more of these creatives'' projects';
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_creative_artwork(p_creative_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_agency_id uuid;
  v_project_id uuid;
  v_assets uuid[];
  v_keys text[];
begin
  select c.agency_id, p.id into v_agency_id, v_project_id
  from creatives c join projects p on p.id = c.project_id
  where c.id = p_creative_id;

  if v_agency_id is null then
    raise exception 'post not found';
  end if;
  if v_project_id not in (select staff_visible_project_ids(v_agency_id)) then
    raise exception 'not permitted';
  end if;

  -- Every file the artwork used: each version's main file and its slides.
  select array_agg(distinct a) into v_assets from (
    select cv.asset_id as a from creative_versions cv
    where cv.creative_id = p_creative_id and cv.asset_id is not null
    union
    select s.asset_id from creative_version_slides s
    join creative_versions cv on cv.id = s.creative_version_id
    where cv.creative_id = p_creative_id
  ) x;

  -- Comments on those versions, and every reply under them.
  create temporary table doomed_comments on commit drop as
  with recursive t(id) as (
    select id from comments
    where creative_version_id in (select id from creative_versions where creative_id = p_creative_id)
    union
    select c.id from comments c join t on c.parent_id = t.id
  )
  select id from t;

  update copy_versions set source_comment_id = null
  where source_comment_id in (select id from doomed_comments);
  delete from comments where id in (select id from doomed_comments);

  -- Slides go with their versions (on delete cascade).
  delete from creative_versions where creative_id = p_creative_id;

  -- Files nothing else still uses: their rows go, and their paths are
  -- returned for storage.
  with freed as (
    delete from assets a
    where a.id = any(coalesce(v_assets, '{}'))
      and not exists (select 1 from creative_versions cv where cv.asset_id = a.id)
      and not exists (select 1 from creative_version_slides s where s.asset_id = a.id)
      and not exists (select 1 from knowledge_entries k where k.asset_id = a.id)
      and not exists (select 1 from clients cl where cl.logo_asset_id = a.id)
      and not exists (select 1 from users u where u.avatar_asset_id = a.id)
      and not exists (select 1 from agency_settings st where st.logo_asset_id = a.id)
    returning a.storage_key
  )
  select coalesce(array_agg(storage_key), '{}') into v_keys from freed;

  return v_keys;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_post_version(p_kind text, p_version_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_agency_id uuid;
  v_project_id uuid;
begin
  if p_kind = 'creative' then
    select cv.agency_id, p.id into v_agency_id, v_project_id
    from creative_versions cv
    join creatives c on c.id = cv.creative_id
    join projects p on p.id = c.project_id
    where cv.id = p_version_id;
  elsif p_kind = 'copy' then
    select cpv.agency_id, p.id into v_agency_id, v_project_id
    from copy_versions cpv
    join creatives c on c.id = cpv.creative_id
    join projects p on p.id = c.project_id
    where cpv.id = p_version_id;
  else
    raise exception 'unknown version kind';
  end if;

  if v_agency_id is null then
    raise exception 'version not found';
  end if;

  if v_project_id not in (select staff_visible_project_ids(v_agency_id)) then
    raise exception 'not permitted';
  end if;

  if exists (
    select 1 from comments
    where deleted_at is null
      and (case when p_kind = 'creative' then creative_version_id else copy_version_id end) = p_version_id
  ) then
    raise exception 'this version has comments';
  end if;

  if p_kind = 'creative' then
    update comments set creative_version_id = null where creative_version_id = p_version_id;
    delete from creative_versions where id = p_version_id;
  else
    update comments set copy_version_id = null where copy_version_id = p_version_id;
    delete from copy_versions where id = p_version_id;
  end if;
end;
$function$
;