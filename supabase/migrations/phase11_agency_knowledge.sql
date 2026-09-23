-- agency_knowledge_entries ---------------------------------------------------
-- Agency-wide reference material (Ca$hvertising, Cialdini, internal
-- playbooks, etc.) — staff-only, no client dimension, same RLS shape as
-- format_directions (this table's own closest precedent). Written notes
-- and uploaded files share this one flat list — unlike client-level
-- knowledge_entries, there are no fixed sections here.

create table agency_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  kind text not null default 'text', -- 'text' | 'file'
  title text not null,
  body text,
  asset_id uuid references assets (id),
  created_by uuid not null references users (id),
  created_at timestamptz not null default now()
);

create index agency_knowledge_entries_agency_idx on agency_knowledge_entries (agency_id);

alter table agency_knowledge_entries enable row level security;

create policy agency_knowledge_entries_select on agency_knowledge_entries
  for select using (is_agency_staff(agency_id));
create policy agency_knowledge_entries_insert on agency_knowledge_entries
  for insert with check (is_agency_staff(agency_id));
create policy agency_knowledge_entries_update on agency_knowledge_entries
  for update using (is_agency_staff(agency_id));
-- format_directions is missing this exact policy (docs/parity-gaps.md
-- flags it as an oversight, not a deliberate choice) — not repeating it.
create policy agency_knowledge_entries_delete on agency_knowledge_entries
  for delete using (is_agency_staff(agency_id));

-- knowledge_entries: add file-upload support alongside the existing
-- text/link kinds. Nullable — every existing row stays a text entry.
alter table knowledge_entries add column asset_id uuid references assets (id);

-- assets: assets_select needs a branch for knowledge-linked assets so a
-- client session can view a file attached to their own client's knowledge
-- folder (agency-level knowledge files need no new branch here — staff
-- already pass via is_agency_staff, and no client ever sees agency_knowledge_entries
-- at all per its own RLS above). Full policy re-declared (Postgres has no
-- ALTER POLICY ... ADD CONDITION) — the first two branches are copied
-- verbatim from phase0_baseline.sql, only the third is new.
drop policy assets_select on assets;
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
      or exists (
        select 1 from knowledge_entries
        where knowledge_entries.asset_id = assets.id
          and knowledge_entries.client_id in (select current_client_ids(assets.agency_id))
      )
    )
  );
