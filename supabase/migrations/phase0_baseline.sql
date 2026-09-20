-- Phase 0 baseline — reconstructed schema for whatever phases 1-5 built
-- directly against the live project, before supabase/migrations/ started
-- being kept (phase6_shared_links.sql is the oldest migration file that
-- exists).
--
-- NOT reconstructed from introspection. supabase/seed.sql turned out to
-- already contain the full current schema — every table, function, trigger
-- and RLS policy, not a fresh-install convenience script — including
-- phases 6, 7 (and its search_path fix) and 8 already folded in. Verified,
-- not assumed: every table this file declares, and every column on it, was
-- checked against the live database via the service-role client (`select
-- <exact declared column list> limit 0` per table — this fails immediately
-- if a declared column doesn't exist), and every function was confirmed
-- callable via `.rpc()`. All of it matched. See "What this doesn't cover"
-- at the bottom for what that verification method can't see.
--
-- This file is seed.sql's content for everything NOT already covered by
-- phase6_shared_links.sql / phase7_agency_settings.sql /
-- phase7_fix_pgcrypto_search_path.sql / phase8_storage.sql — extracted, not
-- retyped, with exactly two adjustments to keep it replayable in sequence
-- before those files:
--   1. creatives: approved_at / approved_by_name / approved_by_email
--      omitted — phase6_shared_links.sql adds these with ALTER TABLE, so
--      creating them here would collide.
--   2. comments: guest_name / guest_email omitted and author_id kept
--      NOT NULL — phase6_shared_links.sql drops that NOT NULL and adds
--      those two columns plus the comments_author_shape constraint that
--      depends on guest_name existing.
-- Applying this file, then the four existing migrations in their existing
-- order, should reproduce the live schema exactly. NOT applied to the live
-- project — this is a reconstruction to check, not a change to make.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Enums --------------------------------------------------------------------

create type plan_tier as enum ('free', 'starter', 'growth', 'agency', 'enterprise');
create type agency_role as enum ('admin', 'user', 'finance');
create type delivery_mode as enum ('scheduled', 'continuous');
create type creative_exception as enum ('changes_requested', 'rejected');
create type copy_source as enum ('upload', 'accepted_edit', 'in_app_edit');
create type comment_visibility as enum ('private', 'public');
create type custom_column_type as enum ('text', 'dropdown', 'status', 'checkbox', 'number');

-- agencies -------------------------------------------------------------------
-- The tenant. Every other row in the system hangs off exactly one agency.

create table agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subdomain citext unique,
  plan plan_tier not null default 'starter',
  plan_renews_at timestamptz,
  storage_bytes_used bigint not null default 0,
  seat_limit int not null default 5,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- users ------------------------------------------------------------------
-- A person with a login. Covers both agency staff and client-side reviewers;
-- which one they are is determined by their memberships, not by a column
-- here. id mirrors auth.users(id) — Supabase Auth owns credentials, sessions
-- and 2FA; this row holds the profile data the app needs to join against.

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  name text not null,
  avatar_asset_id uuid, -- fk added below, once assets exists
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- clients ------------------------------------------------------------------
-- A brand the agency does work for.

create table clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  name text not null,
  industry text,
  logo_asset_id uuid, -- fk added below, once assets exists
  accent_colour text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index clients_agency_name_key
  on clients (agency_id, lower(name))
  where archived_at is null;

-- assets ---------------------------------------------------------------------
-- Uploaded files. Referenced by versions, logos and avatars.

create table assets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  storage_key text not null, -- object storage path. Never a public URL — sign on read.
  filename text not null,
  mime_type text not null,
  bytes bigint not null,
  width int,
  height int,
  duration_seconds numeric,
  checksum text,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

alter table users
  add constraint users_avatar_asset_id_fkey foreign key (avatar_asset_id) references assets (id);

alter table clients
  add constraint clients_logo_asset_id_fkey foreign key (logo_asset_id) references assets (id);

-- memberships ----------------------------------------------------------------
-- Joins a user to an agency with a role. This is where permissions are
-- decided. A client-side membership has client_id set and is what drives
-- every "can this person see this" check — it is not a separate user type.

create table memberships (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  user_id uuid not null references users (id),
  role agency_role not null,
  client_id uuid references clients (id),
  invited_by uuid references users (id),
  invited_at timestamptz,
  accepted_at timestamptz default now(),
  removed_at timestamptz,
  unique (agency_id, user_id, client_id)
);

create index memberships_user_id_idx on memberships (user_id);
create index memberships_agency_client_idx on memberships (agency_id, client_id);

-- projects -------------------------------------------------------------------
-- A body of work for one client. delivery decides which interface the user
-- gets, so it is not cosmetic, and it is immutable after the first creative
-- is added (enforced by trigger below).

create table projects (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id), -- denormalised from client, for RLS
  client_id uuid not null references clients (id),
  name text not null,
  delivery delivery_mode not null,
  type text,
  accent_colour text,
  due_on date,
  position int not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index projects_client_name_key
  on projects (client_id, lower(name))
  where archived_at is null;

-- creatives --------------------------------------------------------------
-- A single piece of work. One table for both scheduled and continuous
-- delivery — the nullable columns differ, not the table.
--
-- approved_at / approved_by_name / approved_by_email are NOT part of this
-- baseline — phase6_shared_links.sql adds them with ALTER TABLE.

create table creatives (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  project_id uuid not null references projects (id),
  name text not null,
  format text not null,
  stage int not null default 1,
  exception creative_exception,
  lead_user_id uuid references users (id),
  concept text,
  reference_url text,
  approach_notes text[],
  scheduled_at timestamptz,
  platforms text[],
  destination text,
  added_on date not null default current_date,
  due_on date,
  published_at timestamptz,
  position int not null default 0,
  cx jsonb not null default '{}'::jsonb,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint creatives_stage_range check (stage between 1 and 8),
  constraint creatives_exception_stage check (exception is null or stage between 1 and 5)
);

create index creatives_project_position_idx on creatives (project_id, position);
create index creatives_agency_scheduled_idx
  on creatives (agency_id, scheduled_at)
  where archived_at is null;
create index creatives_agency_due_idx
  on creatives (agency_id, due_on)
  where archived_at is null and due_on is not null;

-- custom_columns ---------------------------------------------------------
-- Fields a team adds to a project (spec section 25).

create table custom_columns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  project_id uuid not null references projects (id),
  key text not null,
  label text not null,
  type custom_column_type not null,
  options jsonb,
  position int not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (project_id, key)
);

-- knowledge_entries --------------------------------------------------------
-- The client knowledge folder (spec section 22).

create table knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  client_id uuid not null references clients (id),
  section text not null,
  kind text not null default 'text',
  title text not null,
  body text,
  url text,
  author_id uuid references users (id),
  created_at timestamptz not null default now()
);

create index knowledge_entries_client_section_idx on knowledge_entries (client_id, section);

-- format_directions ---------------------------------------------------------
-- What each format needs from the copy, and the numbers the drafter builds
-- to (spec section 23). Agency-scoped reference data, not per-client.

create table format_directions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  format_id text not null,
  direction_text text,
  caption_chars int,
  sentences_min int,
  sentences_max int,
  artwork_lines int,
  words_per_line int,
  caps_rule text,
  created_at timestamptz not null default now(),
  unique (agency_id, format_id)
);

-- creative_versions ------------------------------------------------------
-- Version history for the asset. Separate from copy so the two can move
-- independently.

create table creative_versions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_id uuid not null references creatives (id),
  version_no int not null,
  asset_id uuid not null references assets (id),
  note text,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  unique (creative_id, version_no)
);

-- copy_versions ------------------------------------------------------------
-- Version history for the words. Independent of the asset version by design.

create table copy_versions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_id uuid not null references creatives (id),
  version_no int not null,
  fields jsonb not null default '{}'::jsonb,
  slide_text text[],
  source copy_source not null,
  source_comment_id uuid, -- fk added below, once comments exists
  note text,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  unique (creative_id, version_no)
);

-- comments -----------------------------------------------------------------
-- Threaded feedback. One table for top-level comments and replies, using a
-- self-reference. Replies do not nest beyond one level (enforced by trigger).
--
-- guest_name / guest_email are NOT part of this baseline —
-- phase6_shared_links.sql adds them, along with the comments_author_shape
-- constraint that depends on guest_name, and drops author_id's NOT NULL.
-- Pre-phase6, every comment came from a real registered user.

create table comments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_id uuid not null references creatives (id),
  parent_id uuid references comments (id),
  author_id uuid not null references users (id),
  body text not null,
  anchor jsonb,
  creative_version_id uuid references creative_versions (id),
  copy_version_id uuid references copy_versions (id),
  suggestion jsonb,
  visibility comment_visibility not null default 'private',
  resolved_at timestamptz,
  resolved_by uuid references users (id),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

alter table copy_versions
  add constraint copy_versions_source_comment_id_fkey foreign key (source_comment_id) references comments (id);

create index comments_creative_created_idx
  on comments (creative_id, created_at desc)
  where deleted_at is null;
create index comments_creative_unresolved_idx
  on comments (creative_id)
  where resolved_at is null;

-- Tenant-consistency triggers ------------------------------------------------
-- Defence in depth: derive/validate agency_id from the parent row rather than
-- trusting whatever the application sends, so a bug in the app layer can't
-- misfile a row into the wrong tenant.
--
-- set_agency_id_from_project() is also used by shared_links_set_agency_id,
-- created in phase6_shared_links.sql — that trigger is not created here,
-- but the function it depends on is, since creatives/custom_columns need it
-- first regardless.

create or replace function set_agency_id_from_client()
returns trigger language plpgsql security definer as $$
begin
  select agency_id into strict new.agency_id from clients where id = new.client_id;
  return new;
end;
$$;

create trigger projects_set_agency_id
  before insert or update of client_id on projects
  for each row execute function set_agency_id_from_client();

create trigger knowledge_entries_set_agency_id
  before insert or update of client_id on knowledge_entries
  for each row execute function set_agency_id_from_client();

create or replace function set_agency_id_from_project()
returns trigger language plpgsql security definer as $$
begin
  select agency_id into strict new.agency_id from projects where id = new.project_id;
  return new;
end;
$$;

create trigger creatives_set_agency_id
  before insert or update of project_id on creatives
  for each row execute function set_agency_id_from_project();

create trigger custom_columns_set_agency_id
  before insert or update of project_id on custom_columns
  for each row execute function set_agency_id_from_project();

create or replace function set_agency_id_from_creative()
returns trigger language plpgsql security definer as $$
begin
  select agency_id into strict new.agency_id from creatives where id = new.creative_id;
  return new;
end;
$$;

create trigger creative_versions_set_agency_id
  before insert or update of creative_id on creative_versions
  for each row execute function set_agency_id_from_creative();

create trigger copy_versions_set_agency_id
  before insert or update of creative_id on copy_versions
  for each row execute function set_agency_id_from_creative();

create trigger comments_set_agency_id
  before insert or update of creative_id on comments
  for each row execute function set_agency_id_from_creative();

-- Delivery mode is immutable once a project has creatives ------------------

create or replace function prevent_delivery_change_with_creatives()
returns trigger language plpgsql security definer as $$
begin
  if new.delivery <> old.delivery and exists (
    select 1 from creatives where project_id = new.id
  ) then
    raise exception 'delivery mode is immutable once a project has creatives; duplicate the project instead';
  end if;
  return new;
end;
$$;

create trigger projects_delivery_immutable
  before update of delivery on projects
  for each row execute function prevent_delivery_change_with_creatives();

-- A creative's date/destination columns must match its project's delivery ---

create or replace function check_creative_delivery_fields()
returns trigger language plpgsql security definer as $$
declare
  project_delivery delivery_mode;
begin
  select delivery into project_delivery from projects where id = new.project_id;

  if project_delivery = 'scheduled' and new.scheduled_at is null then
    raise exception 'scheduled_at is required on a creative in a scheduled project';
  end if;
  if project_delivery = 'continuous' and new.destination is null then
    raise exception 'destination is required on a creative in a continuous project';
  end if;

  return new;
end;
$$;

create trigger creatives_check_delivery_fields
  before insert or update on creatives
  for each row execute function check_creative_delivery_fields();

-- A reply may not itself be a reply -----------------------------------------

create or replace function check_comment_reply_depth()
returns trigger language plpgsql security definer as $$
declare
  grandparent_id uuid;
begin
  if new.parent_id is not null then
    select parent_id into grandparent_id from comments where id = new.parent_id;
    if grandparent_id is not null then
      raise exception 'replies cannot nest beyond one level';
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_check_reply_depth
  before insert or update of parent_id on comments
  for each row execute function check_comment_reply_depth();

-- Comment visibility ---------------------------------------------------------
-- Client-side authors have no internal/private concept — their comments are
-- always public, enforced here rather than merely defaulted, since a client
-- unchecking a box client-side proves nothing. And a reply may not be more
-- visible than the comment it replies to (spec section 27).
--
-- Predates phase6: the visibility column and this trigger are not touched
-- by any of phase6_shared_links.sql's ALTER statements. Verified
-- behaviourally, not just by reading this function — see
-- docs/comment-visibility-verification.md.

create or replace function enforce_comment_visibility()
returns trigger language plpgsql security definer as $$
declare
  parent_visibility comment_visibility;
  comment_agency_id uuid;
begin
  select agency_id into strict comment_agency_id from creatives where id = new.creative_id;

  if not is_agency_staff(comment_agency_id) then
    new.visibility := 'public';
  end if;

  if new.parent_id is not null then
    select visibility into parent_visibility from comments where id = new.parent_id;
    if parent_visibility = 'private' and new.visibility = 'public' then
      raise exception 'a reply cannot be more visible than the comment it replies to';
    end if;
  end if;

  return new;
end;
$$;

create trigger comments_enforce_visibility
  before insert or update of visibility, parent_id on comments
  for each row execute function enforce_comment_visibility();

-- Row-level security ---------------------------------------------------------
--
-- Every query is expected to filter on agency_id; RLS enforces that as a
-- second layer regardless of what the application layer remembers to do.
--
-- Two access shapes recur:
--  - agency staff (membership.client_id is null) see everything in their
--    agency
--  - client-side users (membership.client_id set) see only rows scoped to
--    that one client
--
-- These are expressed as SECURITY DEFINER helper functions so policies stay
-- short and the membership table itself doesn't need to be queried through
-- RLS from within another policy.

create or replace function current_agency_ids()
returns setof uuid
language sql security definer stable as $$
  select agency_id from memberships
  where user_id = auth.uid() and removed_at is null and accepted_at is not null;
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
  );
$$;

create or replace function is_agency_admin(check_agency_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where agency_id = check_agency_id
      and user_id = auth.uid()
      and role = 'admin'
      and client_id is null
      and removed_at is null
      and accepted_at is not null
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
    and accepted_at is not null;
$$;

alter table agencies enable row level security;
alter table users enable row level security;
alter table memberships enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table creatives enable row level security;
alter table creative_versions enable row level security;
alter table copy_versions enable row level security;
alter table comments enable row level security;
alter table assets enable row level security;
alter table custom_columns enable row level security;
alter table knowledge_entries enable row level security;
alter table format_directions enable row level security;

-- agencies: visible to anyone with a membership in it. Only an admin can
-- change agency-level settings.
create policy agencies_select on agencies
  for select using (id in (select current_agency_ids()));
create policy agencies_update on agencies
  for update using (is_agency_admin(id));

-- users: a user can always see their own row, plus the rows of anyone they
-- share an agency membership with (so names resolve on comments, briefs...).
create policy users_select on users
  for select using (
    id = auth.uid()
    or exists (
      select 1 from memberships m1
      join memberships m2 on m1.agency_id = m2.agency_id
      where m1.user_id = auth.uid() and m1.removed_at is null
        and m2.user_id = users.id and m2.removed_at is null
    )
  );
create policy users_update_self on users
  for update using (id = auth.uid());

-- memberships: visible to anyone in the same agency; only an admin manages them.
create policy memberships_select on memberships
  for select using (agency_id in (select current_agency_ids()));
create policy memberships_insert on memberships
  for insert with check (is_agency_admin(agency_id));
create policy memberships_update on memberships
  for update using (is_agency_admin(agency_id));
create policy memberships_delete on memberships
  for delete using (is_agency_admin(agency_id));

-- clients: staff see every client in the agency; client-side users see only
-- the client(s) their membership scopes them to.
create policy clients_select on clients
  for select using (
    agency_id in (select current_agency_ids())
    and (is_agency_staff(agency_id) or id in (select current_client_ids(agency_id)))
  );
create policy clients_insert on clients
  for insert with check (is_agency_staff(agency_id));
create policy clients_update on clients
  for update using (is_agency_staff(agency_id));

-- projects: same client-scoping shape as clients.
create policy projects_select on projects
  for select using (
    agency_id in (select current_agency_ids())
    and (is_agency_staff(agency_id) or client_id in (select current_client_ids(agency_id)))
  );
create policy projects_insert on projects
  for insert with check (is_agency_staff(agency_id));
create policy projects_update on projects
  for update using (is_agency_staff(agency_id));

-- creatives: client-scoping via the parent project.
create policy creatives_select on creatives
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or exists (
        select 1 from projects
        where projects.id = creatives.project_id
          and projects.client_id in (select current_client_ids(creatives.agency_id))
      )
    )
  );
create policy creatives_insert on creatives
  for insert with check (is_agency_staff(agency_id));
create policy creatives_update on creatives
  for update using (
    is_agency_staff(agency_id)
    or exists (
      select 1 from projects
      where projects.id = creatives.project_id
        and projects.client_id in (select current_client_ids(creatives.agency_id))
    )
  );

-- creative_versions / copy_versions: same shape, one join further down.
create policy creative_versions_select on creative_versions
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or exists (
        select 1 from creatives
        join projects on projects.id = creatives.project_id
        where creatives.id = creative_versions.creative_id
          and projects.client_id in (select current_client_ids(creative_versions.agency_id))
      )
    )
  );
create policy creative_versions_insert on creative_versions
  for insert with check (is_agency_staff(agency_id));

create policy copy_versions_select on copy_versions
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or exists (
        select 1 from creatives
        join projects on projects.id = creatives.project_id
        where creatives.id = copy_versions.creative_id
          and projects.client_id in (select current_client_ids(copy_versions.agency_id))
      )
    )
  );
create policy copy_versions_insert on copy_versions
  for insert with check (
    is_agency_staff(agency_id)
    or exists (
      select 1 from creatives
      join projects on projects.id = creatives.project_id
      where creatives.id = copy_versions.creative_id
        and projects.client_id in (select current_client_ids(copy_versions.agency_id))
    )
  );

-- comments: staff see everything, private or public. Client-side users see
-- only public comments on creatives that belong to their client — private
-- ones are invisible to them at the RLS layer, not just hidden in the UI
-- (spec section 27).
create policy comments_select on comments
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
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
create policy comments_insert on comments
  for insert with check (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or exists (
        select 1 from creatives
        join projects on projects.id = creatives.project_id
        where creatives.id = comments.creative_id
          and projects.client_id in (select current_client_ids(comments.agency_id))
      )
    )
  );
create policy comments_update_own on comments
  for update using (author_id = auth.uid() or is_agency_staff(agency_id));

-- assets: staff see every asset in the agency. Client-side users see only
-- assets reachable through a creative version/copy version on their own
-- client's creatives, or their client's logo.
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
    )
  );
create policy assets_insert on assets
  for insert with check (agency_id in (select current_agency_ids()));

-- custom_columns: same client-scoping shape as projects for read access.
-- Only agency staff manage the columns themselves — building the table
-- shape is an agency action (spec section 25 — the "+" at the header row).
create policy custom_columns_select on custom_columns
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or exists (
        select 1 from projects
        where projects.id = custom_columns.project_id
          and projects.client_id in (select current_client_ids(custom_columns.agency_id))
      )
    )
  );
create policy custom_columns_insert on custom_columns
  for insert with check (is_agency_staff(agency_id));
create policy custom_columns_update on custom_columns
  for update using (is_agency_staff(agency_id));
create policy custom_columns_delete on custom_columns
  for delete using (is_agency_staff(agency_id));

-- knowledge_entries: same client-scoping shape as clients/projects for read
-- access. Only agency staff write to it — the knowledge folder is the
-- agency's method, curated by the agency (spec section 22).
create policy knowledge_entries_select on knowledge_entries
  for select using (
    agency_id in (select current_agency_ids())
    and (
      is_agency_staff(agency_id)
      or client_id in (select current_client_ids(agency_id))
    )
  );
create policy knowledge_entries_insert on knowledge_entries
  for insert with check (is_agency_staff(agency_id));
create policy knowledge_entries_update on knowledge_entries
  for update using (is_agency_staff(agency_id));
create policy knowledge_entries_delete on knowledge_entries
  for delete using (is_agency_staff(agency_id));

-- format_directions: agency-internal reference data. Not client-scoped —
-- there is no client dimension on this table at all.
create policy format_directions_select on format_directions
  for select using (is_agency_staff(agency_id));
create policy format_directions_insert on format_directions
  for insert with check (is_agency_staff(agency_id));
create policy format_directions_update on format_directions
  for update using (is_agency_staff(agency_id));

-- What this doesn't cover ----------------------------------------------------
--
-- The verification behind this file could only confirm what PostgREST
-- exposes: that each declared table and its declared columns exist live
-- (`select <exact column list> limit 0` per table, all 15 tables, all
-- columns present), and that each declared function is callable (`.rpc()`
-- with dummy arguments, checked for "function does not exist" specifically
-- rather than any error). That is real, not assumed — but it cannot see:
--
--   - Whether the live database has EXTRA tables, columns or functions not
--     declared anywhere in seed.sql. Nothing queryable through the REST API
--     would reveal an undeclared object's existence.
--   - Exact RLS policy text, beyond the one behavioural test already done
--     (comments_select vs. a real client-role session — see
--     docs/comment-visibility-verification.md). The other policies above
--     are transcribed from seed.sql and not independently re-verified
--     against live behaviour one by one.
--   - Exact trigger definitions, check constraints, foreign keys, or index
--     definitions — same limitation, transcribed and not independently
--     re-verified.
--   - Any project-level configuration outside `public`/`storage` schema DDL
--     (auth settings, extension versions beyond pgcrypto/citext, etc).
--
-- Closing that gap needs either a direct Postgres connection (a database
-- password, not the service-role API key this project has) or Supabase
-- Management API / MCP access, neither of which is available in this
-- environment. Not applied to the live project.
