-- Phase 121 — proofreading what's saved.
--
-- Decided directly (24 Oct 2026): straight after copy, or a Production
-- field, is saved, Frank proofreads the version just saved: spelling,
-- punctuation and grammar (one AI request, respecting the client's tone),
-- and paragraphs that run on with a single line break (worked out without
-- AI). The suggestions are listed under the field, each with Fix and
-- Ignore; nothing is changed until the person does. Kept with the version,
-- so opening the post again doesn't proofread it again, and an Ignore
-- stays ignored. Saving into a version again replaces its proofread. The
-- team's only.

create table proofreads (
  id uuid primary key default gen_random_uuid(),
  creative_id uuid not null references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  -- A copy version's, or a Production field's version (phase120).
  kind text not null check (kind in ('copy', 'production')),
  version_id uuid not null,
  -- [{id, field, from, to, reason, kind}]
  suggestions jsonb not null default '[]',
  -- The suggestions' ids the team chose to ignore.
  ignored text[] not null default '{}',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (version_id)
);

create trigger proofreads_set_agency_id
  before insert or update of creative_id on proofreads
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on proofreads
  for each row execute function block_writes_when_read_only();

alter table proofreads enable row level security;
create policy proofreads_select on proofreads
  for select using (can_see_creative_as_staff(creative_id));
create policy proofreads_insert on proofreads
  for insert with check (can_see_creative_as_staff(creative_id) and created_by = auth.uid());
-- Replacing it on a later save, and Ignore.
create policy proofreads_update on proofreads
  for update using (can_see_creative_as_staff(creative_id)) with check (can_see_creative_as_staff(creative_id));

-- So the API sees the new table straight away.
notify pgrst, 'reload schema';
