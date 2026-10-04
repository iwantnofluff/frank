-- Phase 54 — a client's Instagram account, connected for its live feed.
--
-- Decided directly (4 Oct 2026): each client can have its Instagram
-- (Business or Creator) account connected, so the Feed Preview shows the
-- planned posts among the real ones. Connected by the agency's Owners and
-- Admins through Instagram's own sign-in, or by the client through a link
-- the agency sends. Publishing is not part of this.
--
-- The access token never reaches a browser: it lives in its own table
-- with RLS on and no policies (service role only), encrypted by the app.

-- What anyone on the client's team can see about the connection.
create table instagram_connections (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  client_id uuid not null unique references clients (id) on delete cascade,
  ig_user_id text not null,
  username text not null,
  name text,
  profile_picture_url text,
  followers_count int,
  media_count int,
  connected_by_name text,
  connected_at timestamptz not null default now(),
  -- Set when Instagram stops accepting the token (password changed,
  -- access removed, expired): the connection needs reconnecting.
  needs_reconnect_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger instagram_connections_set_agency_id
  before insert or update of client_id on instagram_connections
  for each row execute function set_agency_id_from_client();
create trigger zz_read_only_guard before insert or update or delete on instagram_connections
  for each row execute function block_writes_when_read_only();

alter table instagram_connections enable row level security;
-- Staff who can see the client read it; only the server writes (it holds
-- the token). Owners and Admins disconnect.
create policy instagram_connections_select on instagram_connections
  for select using (client_id in (select staff_visible_client_ids(agency_id)));
create policy instagram_connections_delete on instagram_connections
  for delete using (is_agency_admin(agency_id));

-- The token, encrypted (AES-GCM, key in the server's environment).
create table instagram_tokens (
  connection_id uuid primary key references instagram_connections (id) on delete cascade,
  token_encrypted text not null,
  expires_at timestamptz not null,
  refreshed_at timestamptz not null default now()
);
alter table instagram_tokens enable row level security;

-- A link the agency sends so the client connects it themselves, without
-- sharing their password. One use, 7 days.
create table instagram_connect_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  client_id uuid not null references clients (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create trigger instagram_connect_links_set_agency_id
  before insert or update of client_id on instagram_connect_links
  for each row execute function set_agency_id_from_client();
alter table instagram_connect_links enable row level security;
create policy instagram_connect_links_select on instagram_connect_links
  for select using (is_agency_admin(agency_id));
create policy instagram_connect_links_insert on instagram_connect_links
  for insert with check (is_agency_admin(agency_id) and created_by = auth.uid());
