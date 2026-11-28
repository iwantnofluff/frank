-- Phase 174 — saved Check Brand, and checks shared to Slack.
--
-- Direct instruction (28 Nov 2026): Check Brand and Check the Month each get
-- Share to Slack, which names the post and links to the saved check; once a
-- check has run, it can be saved (over the last one, when the content has
-- moved on). Decided directly: the link opens the post's Edit window on its
-- Checks tab, and Check the Month keeps its saved review until Save, as
-- Check Brand does.
--
-- Check Brand kept nothing before. Now each post keeps its last saved one:
-- the findings, and the copy version that was saved when it ran, so it can
-- say when the copy has changed since. The team who can see the post read
-- and write it; never a client. (month_reviews, phase173, needs no change:
-- the app now writes it only on Save, or on a month's first run.)

create table brand_checks (
  creative_id uuid primary key references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id) on delete cascade,
  -- [{ "tone": "ok" | "warn", "title": "...", "body": "..." }], as shown.
  findings jsonb not null check (jsonb_typeof(findings) = 'array'),
  copy_version_no int,
  created_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger brand_checks_set_agency_id
  before insert or update of creative_id on brand_checks
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on brand_checks
  for each row execute function block_writes_when_read_only();

alter table brand_checks enable row level security;
create policy brand_checks_select on brand_checks
  for select using (
    is_agency_staff(agency_id)
    and exists (select 1 from creatives c where c.id = creative_id and c.project_id in (select staff_visible_project_ids(c.agency_id)))
  );
create policy brand_checks_insert on brand_checks
  for insert with check (
    is_agency_staff(agency_id)
    and exists (select 1 from creatives c where c.id = creative_id and c.project_id in (select staff_visible_project_ids(c.agency_id)))
  );
create policy brand_checks_update on brand_checks
  for update using (
    is_agency_staff(agency_id)
    and exists (select 1 from creatives c where c.id = creative_id and c.project_id in (select staff_visible_project_ids(c.agency_id)))
  )
  with check (
    is_agency_staff(agency_id)
    and exists (select 1 from creatives c where c.id = creative_id and c.project_id in (select staff_visible_project_ids(c.agency_id)))
  );
