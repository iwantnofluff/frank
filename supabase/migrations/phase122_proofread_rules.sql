-- Phase 122 — the workspace's proofreading rules.
--
-- Decided directly (25 Oct 2026): Settings → Knowledge → Proofreading lists
-- the rules Frank proofreads by, each switched on or off for the whole
-- workspace, and lets Owners and Admins add their own: an instruction
-- Frank's AI follows, or a preferred word (always write X as Y), checked
-- exactly without AI. The built-in rules live in the app (lib/
-- proofread-rules.ts); a row for one is kept only once it's been changed,
-- so every built-in is on until someone switches it off. The team reads
-- them (the proofread route reads them as whoever saved); clients never.

create table proofread_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  -- builtin: one of the app's rules, by rule_key. instruction: the
  -- workspace's own, in its words. word: always write from_word as to_word.
  kind text not null check (kind in ('builtin', 'instruction', 'word')),
  rule_key text,
  title text,
  body text,
  from_word text,
  to_word text,
  enabled boolean not null default true,
  -- A built-in's settings: British or American spelling, the AI phrases.
  options jsonb not null default '{}',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, rule_key),
  check (
    (kind = 'builtin' and rule_key is not null)
    or (kind = 'instruction' and rule_key is null and length(trim(coalesce(body, ''))) > 0)
    or (kind = 'word' and rule_key is null and length(trim(coalesce(from_word, ''))) > 0 and to_word is not null)
  )
);

create index proofread_rules_agency on proofread_rules (agency_id);

create trigger zz_read_only_guard before insert or update or delete on proofread_rules
  for each row execute function block_writes_when_read_only();

alter table proofread_rules enable row level security;
create policy proofread_rules_select on proofread_rules
  for select using (is_agency_staff(agency_id));
-- Owners and Admins change them, as with Format Directions (phase94).
create policy proofread_rules_insert on proofread_rules
  for insert with check (is_agency_admin(agency_id));
create policy proofread_rules_update on proofread_rules
  for update using (is_agency_admin(agency_id)) with check (is_agency_admin(agency_id));
create policy proofread_rules_delete on proofread_rules
  for delete using (is_agency_admin(agency_id));

-- So the API sees the new table straight away.
notify pgrst, 'reload schema';
