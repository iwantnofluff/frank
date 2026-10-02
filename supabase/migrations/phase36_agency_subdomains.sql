-- Phase 36 — each agency at its own address: agencyname.beingfrank.app.
--
-- Decided directly: every agency has a short name, its subdomain
-- (No Fluff is "nofluff", the first). beingfrank.app itself is a holding
-- page. And someone who belongs to two agencies sees only the work of the
-- agency whose address they're on.
--
-- 1. The short name. agencies.subdomain already exists (phase0, unique,
--    citext) and was never set. It gets a format — lower-case letters,
--    numbers and hyphens, 2–32 long, not starting or ending with a
--    hyphen — and names Frank keeps for itself are refused.
alter table agencies add constraint agencies_subdomain_format check (
  subdomain is null or (
    subdomain::text ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])$'
    and subdomain::text not in (
      'www', 'app', 'admin', 'api', 'mail', 'email', 'help', 'support', 'status',
      'blog', 'docs', 'login', 'signup', 'billing', 'static', 'assets', 'cdn', 'frank'
    )
  )
);

update agencies set subdomain = 'nofluff' where id = '8cb48f60-eb9c-4f39-b73f-dfbf7bc4aca6';

-- 2. Which agency's address the request came from. The app sends the
--    subdomain in an x-frank-agency header on every database request
--    (lib/supabase/client.ts and server.ts). It can only narrow: every
--    helper below still requires a real membership, so a forged header
--    shows less, never more. No header (plain localhost, the old
--    vercel.app address, the service role) narrows nothing, as before.
create or replace function in_request_agency(check_agency_id uuid)
returns boolean
language sql security definer stable set search_path = public, extensions as $$
  select case
    when coalesce(current_setting('request.headers', true), '') = '' then true
    when coalesce(current_setting('request.headers', true)::json ->> 'x-frank-agency', '') = '' then true
    else exists (
      select 1 from agencies a
      where a.id = check_agency_id
        and a.subdomain = (current_setting('request.headers', true)::json ->> 'x-frank-agency')::citext
    )
  end;
$$;

-- 3. Every access helper counts only memberships in that agency. All
--    tenant RLS goes through these (AGENTS.md: policies call the helpers),
--    so narrowing them narrows every policy. Bodies otherwise exactly as
--    their latest versions (phase0, phase23b, phase23c).
create or replace function current_agency_ids()
returns setof uuid
language sql security definer stable as $$
  select agency_id from memberships
  where user_id = auth.uid() and removed_at is null and accepted_at is not null
    and in_request_agency(agency_id);
$$;

create or replace function is_agency_staff(check_agency_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where agency_id = check_agency_id
      and user_id = auth.uid()
      and client_id is null
      and removed_at is null
      and accepted_at is not null
      and in_request_agency(agency_id)
  );
$$;

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
      and in_request_agency(agency_id)
  );
$$;

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
      and in_request_agency(agency_id)
  );
$$;

create or replace function current_client_ids(check_agency_id uuid)
returns setof uuid
language sql security definer stable as $$
  select client_id from memberships
  where agency_id = check_agency_id
    and user_id = auth.uid()
    and client_id is not null
    and removed_at is null
    and accepted_at is not null
    and in_request_agency(agency_id);
$$;

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
          and in_request_agency(m.agency_id)
      )
      or id in (select current_client_ids(check_agency_id))
    );
$$;

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
          and in_request_agency(m.agency_id)
      )
    );
$$;

-- Seeing the people you share an agency with (phase25): only the agency
-- whose address you're on.
drop policy users_select on users;
create policy users_select on users
  for select using (
    id = auth.uid()
    or exists (
      select 1 from memberships m1
      join memberships m2 on m1.agency_id = m2.agency_id
      where m1.user_id = auth.uid() and m1.removed_at is null
        and m2.user_id = users.id
        and in_request_agency(m1.agency_id)
    )
  );

-- 4. For the address itself, before anyone signs in: does this workspace
--    exist, and what's its name (the sign-in page shows it). Only the
--    name — nothing else about the agency is public.
create or replace function workspace_for_subdomain(p_subdomain text)
returns table (name text)
language sql security definer stable set search_path = public, extensions as $$
  select a.name from agencies a
  where a.subdomain = p_subdomain::citext and a.archived_at is null;
$$;

grant execute on function workspace_for_subdomain(text) to anon, authenticated;
