-- Phase 7 — Agency Settings
-- Run this once against the live database (also folded into seed.sql for
-- future fresh installs).

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
-- admin-only. Uses the existing is_agency_admin() helper rather than a
-- fresh inline check — it additionally requires client_id is null and the
-- membership to be active (not removed, invite accepted), which a bare
-- `role = 'admin'` check does not.
create policy agency_settings_select on agency_settings
  for select using (agency_id in (select current_agency_ids()));
create policy agency_settings_update on agency_settings
  for update using (is_agency_admin(agency_id));
create policy agency_settings_insert on agency_settings
  for insert with check (is_agency_admin(agency_id));
