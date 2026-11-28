-- Phase 173 — Check the Month (direct instruction, 28 Nov 2026).
--
-- From a post's Checks, Frank reviews the direction of its project's posts
-- for that month against the client's Knowledge and the month's strategy:
-- the whole month's content, not any one post. Words only (decided
-- directly). The last review is kept, one per project and month (decided
-- directly), so the team shares it and the AI limit isn't spent each time
-- it's opened; Run Again writes a new one over it.
--
-- posts_at and post_count are the month's posts as they were when it was
-- written (the newest change among them, and how many), so the window can
-- say when they've changed since. The team who can see the project read and
-- write it; never a client.

create table month_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  agency_id uuid not null references agencies (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  -- Frank's review, as the app reads it (lib/month-review.ts).
  review jsonb not null,
  posts_at timestamptz,
  post_count int not null default 0,
  created_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (project_id, month)
);

create trigger month_reviews_set_agency_id
  before insert or update of project_id on month_reviews
  for each row execute function set_agency_id_from_project();
create trigger zz_read_only_guard before insert or update or delete on month_reviews
  for each row execute function block_writes_when_read_only();

alter table month_reviews enable row level security;
create policy month_reviews_select on month_reviews
  for select using (is_agency_staff(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy month_reviews_insert on month_reviews
  for insert with check (is_agency_staff(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));
create policy month_reviews_update on month_reviews
  for update using (is_agency_staff(agency_id) and project_id in (select staff_visible_project_ids(agency_id)))
  with check (is_agency_staff(agency_id) and project_id in (select staff_visible_project_ids(agency_id)));

-- Logged as its own AI task, counted towards the workspace's monthly limit.
alter table ai_usage_events drop constraint if exists ai_usage_events_task_check;
alter table ai_usage_events add constraint ai_usage_events_task_check check (task = any (array[
  'copy_chat', 'design_direction', 'proofread', 'check', 'check_creative', 'check_design',
  'wiifm_note', 'voice_post', 'strategy_overview', 'classify_comment', 'ask_frank', 'check_vo',
  'month_review'
]));

notify pgrst, 'reload schema';
