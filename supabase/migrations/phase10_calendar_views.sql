-- calendar_views ------------------------------------------------------------
-- Saved column layouts for the project calendar table (order, hidden set,
-- widths). Agency-internal reference data, same shape as
-- format_directions: not client- or project-scoped — a view is reusable
-- across every project a staff member opens, which is the point (the
-- product ask was explicitly "saved globally, so the user can select for
-- other clients too"). A view naming a column key that doesn't exist on
-- whatever project it's applied to (a per-project custom column, say)
-- simply has no effect there — same graceful-miss behavior column
-- visibility already has for a key it doesn't recognise.

create table calendar_views (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  name text not null,
  column_order text[] not null,
  hidden_columns text[] not null default '{}',
  column_widths jsonb not null default '{}'::jsonb,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index calendar_views_agency_name_key
  on calendar_views (agency_id, lower(name));

alter table calendar_views enable row level security;

-- Same reach as format_directions: agency staff only, no client dimension.
create policy calendar_views_select on calendar_views
  for select using (is_agency_staff(agency_id));
create policy calendar_views_insert on calendar_views
  for insert with check (is_agency_staff(agency_id));
create policy calendar_views_update on calendar_views
  for update using (is_agency_staff(agency_id));
-- format_directions has no delete policy at all (docs/parity-gaps.md
-- flags this as a likely oversight, not a deliberate choice) — adding one
-- here rather than repeating it.
create policy calendar_views_delete on calendar_views
  for delete using (is_agency_staff(agency_id));
