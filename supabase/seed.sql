-- Frank — core schema
-- Based on frank-schema.docx (the data model document, which supersedes
-- section 3 of the product specification).
--
-- Decisions made while translating the document into DDL:
--
-- 1. Campaigns are not a table. frank-schema.docx still draws the hierarchy as
--    agency -> client -> project -> campaign -> creative -> version, but the
--    developer handover and spec v11 section 9 both state campaigns were
--    removed as a hierarchy level during design and that any reference to
--    them elsewhere is stale and should be read as "project". creatives
--    therefore carries project_id, not campaign_id, and there is no
--    campaigns table.
-- 2. users.password_hash and users.totp_secret are omitted. Auth (including
--    passwords, SSO and 2FA) is handled by Supabase Auth in the auth schema;
--    public.users.id is a foreign key to auth.users(id) rather than a
--    parallel credential store.
-- 3. Only the tables needed for the Phase 1 core loop are created here:
--    agencies, users, memberships, clients, projects, creatives,
--    creative_versions, copy_versions, comments, and assets (a required
--    dependency of the others). permissions, comment_reactions,
--    status_events, saved_views, agency_settings, notifications and the
--    platform-connection tables described later in the schema doc are
--    deferred to the phase that needs them.
--
-- Six tables reference each other in a cycle (users <-> assets,
-- copy_versions <-> comments), which a single CREATE TABLE pass can't express.
-- Those columns are added with ALTER TABLE once both sides exist.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Enums --------------------------------------------------------------------

create type plan_tier as enum ('free', 'starter', 'growth', 'agency', 'enterprise');
create type agency_role as enum ('admin', 'user', 'finance');
create type delivery_mode as enum ('scheduled', 'continuous');
create type creative_exception as enum ('changes_requested', 'rejected');
create type copy_source as enum ('upload', 'accepted_edit', 'in_app_edit');
create type comment_visibility as enum ('private', 'public');
-- The full set is text, long_text, status, dropdown, people, date, number,
-- currency, checkbox, link (spec section 25). Only the five asked for in
-- this pass are enumerated; adding the rest later is a migration either way.
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
  -- Defaults to accepted: there's no invite/accept flow built yet, so a
  -- membership created directly (self-serve signup, a seed script) should
  -- be active immediately. Once invites exist, insert that row with
  -- accepted_at explicitly null and let acceptance set it.
  accepted_at timestamptz default now(),
  removed_at timestamptz, -- soft delete, so their comments keep an author
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
  type text, -- secondary label only (Social media, Amazon, Web, Print, events) — no behaviour
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

create table creatives (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  project_id uuid not null references projects (id),
  name text not null,
  format text not null, -- one of the 41 format keys; store the key, not the label
  stage int not null default 1,
  exception creative_exception,
  lead_user_id uuid references users (id),
  concept text,
  reference_url text,
  approach_notes text[],
  scheduled_at timestamptz, -- required when the project is scheduled
  platforms text[],
  destination text, -- required when the project is continuous
  added_on date not null default current_date,
  due_on date,
  published_at timestamptz,
  -- Set by an approval coming through a shared review link — there's no
  -- registered user to attribute it to, and no status_events audit table
  -- yet (deferred in Phase 1), so this is the record until that exists.
  approved_at timestamptz,
  approved_by_name text,
  approved_by_email text,
  position int not null default 0,
  -- Custom column values, keyed by custom_columns.key. A jsonb blob rather
  -- than real columns because the set of fields is per-project and
  -- open-ended — same trade-off the schema doc makes for copy_versions.fields.
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
-- Fields a team adds to a project (spec section 25). Column definitions are
-- a real table — the list needs ordering and lookup by key — but the
-- values they hold live in creatives.cx, since the set of fields is
-- per-project and open-ended.

create table custom_columns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  project_id uuid not null references projects (id),
  key text not null, -- stable identifier used as the key in creatives.cx
  label text not null,
  type custom_column_type not null,
  options jsonb, -- dropdown/status: [{value, label, colour?}]
  position int not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (project_id, key)
);

-- knowledge_entries --------------------------------------------------------
-- The client knowledge folder (spec section 22): eight fixed sections, each
-- accepting text, a file, a link or an image. Only the text kind is
-- editable through the app in this phase — file/link/image are real data
-- shapes but nothing uploads or fetches them yet, so building that UI now
-- would be a drop zone that lies about what it does.

create table knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  client_id uuid not null references clients (id),
  section text not null, -- tone | audience | features | brand_research | products | brands_admired | protected_terms | moodboard
  kind text not null default 'text', -- text | file | link | image
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
-- format_id is free text rather than an enum — the 41-format list lives in
-- application data, not the database, so adding one is not a migration.

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

-- agency_settings --------------------------------------------------------------
-- Branding and nomenclature (spec section 16, schema doc). One row per
-- agency — agency_id is the primary key, not a foreign key column on a
-- surrogate id, since there is exactly one.

create table agency_settings (
  agency_id uuid primary key references agencies (id),
  theme jsonb not null default '{"action":"#007BFF", "rail":"#003C61", "canvas":"#EDF1F6", "surface":"#FFFFFF", "ink":"#14161A", "line":"#E3E6EA", "amber":"#FF8A00", "green":"#2BB65B", "rose":"#FF0000", "highlight":"#FFFBF0"}'::jsonb,
  terms jsonb not null default '{"client":"Client", "clients":"Clients", "project":"Project", "projects":"Projects", "creative":"Creative", "creatives":"Creatives", "approver":"Primary approver", "review":"Review", "content":"Content", "performance":"Performance"}'::jsonb,
  logo_asset_id uuid references assets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agency_settings enable row level security;

-- Read is agency-wide (clients see white-labelled branding too); write is
-- admin-only, matching admin-locked settings elsewhere in the product.
create policy agency_settings_select on agency_settings
  for select using (agency_id in (select current_agency_ids()));
create policy agency_settings_update on agency_settings
  for update using (is_agency_admin(agency_id));
create policy agency_settings_insert on agency_settings
  for insert with check (is_agency_admin(agency_id));

-- shared_links ---------------------------------------------------------------
-- The zero-account client review link (spec section 26). token is the only
-- credential — anyone who has it can read what the scope allows. Everything
-- that actually touches project/creative/comment data goes through the
-- get_shared_review/submit_shared_* functions below rather than direct
-- table RLS, so the anon role never needs a broad grant on those tables;
-- only this table gets a narrow, column-limited anon grant (see below).

create type shared_link_scope as enum ('pending', 'all', 'one', 'pick');

create table shared_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  project_id uuid not null references projects (id),
  token text not null unique,
  scope shared_link_scope not null,
  creative_id uuid references creatives (id), -- used when scope = 'one'
  picked_creatives uuid[], -- used when scope = 'pick'
  expires_at timestamptz,
  requires_passcode boolean not null default false,
  passcode_hash text, -- bf-crypted; never selectable by anon (column grant below)
  can_approve boolean not null default false,
  created_by uuid not null references users (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shared_links_passcode_shape check (
    (requires_passcode and passcode_hash is not null)
    or (not requires_passcode and passcode_hash is null)
  )
);

create index shared_links_token_idx on shared_links (token);

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
  fields jsonb not null default '{}'::jsonb, -- keyed by copy field: caption, headline, cta, subject_line, preview_text, alt_text
  slide_text text[], -- per-slide text for carousels, positional
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

create table comments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_id uuid not null references creatives (id),
  parent_id uuid references comments (id),
  -- Nullable: a shared-link visitor has no users row at all — they're
  -- attributed by guest_name/guest_email instead (spec section 26, "reading
  -- needs no sign-in; commenting and approving do" — "sign in" here means
  -- giving a name and email, not creating an account).
  author_id uuid references users (id),
  guest_name text,
  guest_email text,
  body text not null,
  anchor jsonb, -- null for a general comment; {type: pin|region|highlight|timeline|range, ...}
  creative_version_id uuid references creative_versions (id),
  copy_version_id uuid references copy_versions (id),
  suggestion jsonb, -- set when the comment proposes a copy change: {from, to}
  -- Private by default: an agency note that stays internal by mistake costs
  -- a follow-up, one that reaches the client cannot be taken back (spec
  -- section 27). Client-side authors never get a choice — enforced below,
  -- not just defaulted, since a client unchecking a box client-side proves
  -- nothing.
  visibility comment_visibility not null default 'private',
  resolved_at timestamptz,
  resolved_by uuid references users (id),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint comments_author_shape check (author_id is not null or guest_name is not null)
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
-- All of these are SECURITY DEFINER. A plain trigger function runs with the
-- calling user's privileges, so a lookup like "select agency_id from
-- creatives where id = new.creative_id" is itself subject to RLS on
-- creatives for that user — usually fine, but it makes row insertion depend
-- on a read permission that has nothing to do with the write being
-- authorised, and a single missed grant turns into an opaque, silent insert
-- failure. These functions each do one narrow, well-understood lookup; that
-- makes them safe to run with elevated rights, the same trade-off already
-- made for is_agency_staff() and current_client_ids() below.

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

create trigger shared_links_set_agency_id
  before insert or update of project_id on shared_links
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
-- Switching scheduled <-> continuous would leave existing creatives holding
-- a date, or a destination, with no column left to live in.

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

create or replace function enforce_comment_visibility()
returns trigger language plpgsql security definer as $$
declare
  parent_visibility comment_visibility;
  comment_agency_id uuid;
begin
  -- Derived independently from creative_id rather than trusting new.agency_id
  -- — trigger firing order across comments_set_agency_id and this one is not
  -- guaranteed, and this check must not silently pass on a null agency_id.
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
-- second layer regardless of what the application layer remembers to do. A
-- missed WHERE clause in a single-tenant product is a bug — in a
-- multi-tenant one it is a data breach.
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
alter table shared_links enable row level security;

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

-- shared_links: agency staff manage them normally. The public flow doesn't
-- use RLS at all — get_shared_review() and submit_shared_*() are SECURITY
-- DEFINER and look the row up themselves, bypassing RLS deliberately and
-- narrowly. The anon grant below is a belt-and-braces convenience (e.g. a
-- lightweight "does this token exist" check) with passcode_hash, agency_id
-- and created_by withheld at the column level regardless of what any policy
-- allows.
create policy shared_links_select on shared_links
  for select using (is_agency_staff(agency_id));
create policy shared_links_insert on shared_links
  for insert with check (is_agency_staff(agency_id));
create policy shared_links_update on shared_links
  for update using (is_agency_staff(agency_id));

create policy shared_links_public_select on shared_links
  for select to anon
  using (revoked_at is null and (expires_at is null or expires_at > now()));

grant select (
  id, project_id, token, scope, creative_id, picked_creatives,
  expires_at, requires_passcode, can_approve, created_at
) on shared_links to anon;

-- Shared review — public functions -------------------------------------------
--
-- Everything the /review/[token] page needs goes through these three
-- functions rather than direct table access. That keeps the "no RLS
-- weakening on the real tables" property intact — anon never gets a grant
-- on creatives, comments, projects etc. — while still letting a visitor who
-- holds nothing but a URL read the work and, if the link allows it,
-- comment or approve.

create or replace function create_shared_link(
  p_project_id uuid,
  p_scope shared_link_scope,
  p_creative_id uuid default null,
  p_picked_creatives uuid[] default null,
  p_expires_in_days int default null, -- null or 0 = never
  p_passcode text default null,
  p_can_approve boolean default false
)
returns table (token text)
language plpgsql as $$
declare
  v_token text := encode(gen_random_bytes(16), 'hex');
begin
  insert into shared_links (
    project_id, token, scope, creative_id, picked_creatives,
    expires_at, requires_passcode, passcode_hash, can_approve, created_by
  ) values (
    p_project_id, v_token, p_scope, p_creative_id, p_picked_creatives,
    case when p_expires_in_days is null or p_expires_in_days = 0 then null
         else now() + (p_expires_in_days || ' days')::interval end,
    p_passcode is not null and p_passcode <> '',
    case when p_passcode is not null and p_passcode <> ''
         then crypt(p_passcode, gen_salt('bf')) else null end,
    p_can_approve,
    auth.uid()
  );
  return query select v_token;
end;
$$;

grant execute on function create_shared_link(uuid, shared_link_scope, uuid, uuid[], int, text, boolean)
  to authenticated;

-- Resolves which creatives a link's scope covers. Stage < 5 (the internal
-- band: Concept, Copy, Design, Internal QC) is excluded unconditionally —
-- an unreleased draft never leaves the building through this door,
-- whatever scope was picked or however a creative_id ended up on the link.
create or replace function shared_link_allowed_creative_ids(v_link shared_links)
returns uuid[]
language sql security definer set search_path = public stable as $$
  select array_agg(id) from creatives
  where project_id = v_link.project_id
    and archived_at is null
    and stage >= 5
    and (
      case v_link.scope
        when 'all' then true
        when 'pending' then stage = 5
        when 'one' then id = v_link.creative_id
        when 'pick' then id = any(v_link.picked_creatives)
        else false
      end
    );
$$;

create or replace function get_shared_review(p_token text, p_passcode text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
  v_allowed_ids uuid[];
  v_project jsonb;
  v_creatives jsonb;
begin
  select * into v_link from shared_links where token = p_token and revoked_at is null;

  if not found or (v_link.expires_at is not null and v_link.expires_at <= now()) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_link.requires_passcode then
    if p_passcode is null or p_passcode = '' then
      return jsonb_build_object('status', 'passcode_required');
    end if;
    if crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash then
      return jsonb_build_object('status', 'passcode_required', 'invalid', true);
    end if;
  end if;

  v_allowed_ids := shared_link_allowed_creative_ids(v_link);

  select jsonb_build_object('id', p.id, 'name', p.name, 'delivery', p.delivery)
    into v_project
    from projects p where p.id = v_link.project_id;

  select coalesce(jsonb_agg(c order by c.position), '[]'::jsonb) into v_creatives
  from (
    select
      cr.id, cr.name, cr.format, cr.stage, cr.position,
      cr.scheduled_at, cr.destination, cr.approved_at,
      (
        select jsonb_build_object(
          'version_no', cv.version_no, 'storage_key', a.storage_key,
          'mime_type', a.mime_type, 'filename', a.filename
        )
        from creative_versions cv join assets a on a.id = cv.asset_id
        where cv.creative_id = cr.id order by cv.version_no desc limit 1
      ) as asset,
      (
        select jsonb_build_object('version_no', cpv.version_no, 'fields', cpv.fields)
        from copy_versions cpv
        where cpv.creative_id = cr.id order by cpv.version_no desc limit 1
      ) as copy,
      (
        -- Public, non-deleted only — this is the strip that matters. Private
        -- comments and anything soft-deleted are never fetched, so there is
        -- no "filter it out before sending" step for a bug to skip.
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', cm.id,
          'author_name', coalesce(u.name, cm.guest_name),
          'body', cm.body,
          'created_at', cm.created_at
        ) order by cm.created_at), '[]'::jsonb)
        from comments cm left join users u on u.id = cm.author_id
        where cm.creative_id = cr.id and cm.visibility = 'public' and cm.deleted_at is null
      ) as comments
    from creatives cr
    where cr.id = any(v_allowed_ids)
  ) c;

  return jsonb_build_object(
    'status', 'ok',
    'scope', v_link.scope,
    'can_approve', v_link.can_approve,
    'project', v_project,
    'creatives', v_creatives
  );
end;
$$;

grant execute on function get_shared_review(text, text) to anon, authenticated;

create or replace function submit_shared_comment(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_body text,
  p_guest_name text,
  p_guest_email text
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
begin
  select * into v_link from shared_links
  where token = p_token and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_link.requires_passcode
     and (p_passcode is null or crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash) then
    return jsonb_build_object('status', 'passcode_required');
  end if;
  if p_guest_name is null or trim(p_guest_name) = '' then
    return jsonb_build_object('status', 'name_required');
  end if;
  if p_body is null or trim(p_body) = '' then
    return jsonb_build_object('status', 'body_required');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (p_creative_id, trim(p_body), trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public');

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function submit_shared_comment(text, text, uuid, text, text, text) to anon, authenticated;

create or replace function submit_shared_approval(
  p_token text,
  p_passcode text,
  p_creative_id uuid,
  p_guest_name text,
  p_guest_email text
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_link shared_links%rowtype;
begin
  select * into v_link from shared_links
  where token = p_token and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not v_link.can_approve then
    return jsonb_build_object('status', 'not_allowed');
  end if;
  if v_link.requires_passcode
     and (p_passcode is null or crypt(p_passcode, v_link.passcode_hash) <> v_link.passcode_hash) then
    return jsonb_build_object('status', 'passcode_required');
  end if;
  if p_guest_name is null or trim(p_guest_name) = '' then
    return jsonb_build_object('status', 'name_required');
  end if;
  if not coalesce(p_creative_id = any(shared_link_allowed_creative_ids(v_link)), false) then
    return jsonb_build_object('status', 'not_allowed');
  end if;

  update creatives
  set stage = 6,
      approved_at = now(),
      approved_by_name = trim(p_guest_name),
      approved_by_email = nullif(trim(p_guest_email), '')
  where id = p_creative_id;

  insert into comments (creative_id, body, guest_name, guest_email, visibility)
  values (
    p_creative_id, 'Approved via shared review link.',
    trim(p_guest_name), nullif(trim(p_guest_email), ''), 'public'
  );

  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function submit_shared_approval(text, text, uuid, text, text) to anon, authenticated;

-- Storage — the assets bucket -------------------------------------------------
-- Objects are stored at {agency_id}/{creative_id}/{uuid}-{filename}. Upload
-- is a staff action, matching creative_versions_insert's own restriction.
-- Read is coarser than the assets table's SELECT policy (see the comment in
-- phase8_storage.sql) — a client only ever gets a storage_key by first
-- reading it through the RLS-protected assets/creative_versions tables,
-- which already did the fine-grained check.

insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

create policy assets_bucket_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets'
    and is_agency_staff(((storage.foldername(name))[1])::uuid)
  );

create policy assets_bucket_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assets'
    and ((storage.foldername(name))[1])::uuid in (select current_agency_ids())
  );
