-- Phase 126 — a post's final asset link.
--
-- Decided directly (29 Oct 2026): the Content tab takes a link to where
-- the finished creative is (a Google Drive folder, say). The table's
-- Creative column then shows Open Asset, and so does the post's page,
-- under its version pickers. One link a post, changed by replacing it.
-- The team's only: kept apart from creatives, which clients can read, so
-- no client ever reads it. A change is in the project's Activity Log.

create table creative_asset_links (
  creative_id uuid primary key references creatives (id) on delete cascade,
  agency_id uuid not null references agencies (id),
  url text not null check (url ~* '^https?://' and length(url) <= 2000),
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger creative_asset_links_set_agency_id
  before insert or update of creative_id on creative_asset_links
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on creative_asset_links
  for each row execute function block_writes_when_read_only();

alter table creative_asset_links enable row level security;
create policy creative_asset_links_select on creative_asset_links
  for select using (can_see_creative_as_staff(creative_id));
create policy creative_asset_links_insert on creative_asset_links
  for insert with check (can_see_creative_as_staff(creative_id));
create policy creative_asset_links_update on creative_asset_links
  for update using (can_see_creative_as_staff(creative_id)) with check (can_see_creative_as_staff(creative_id));
create policy creative_asset_links_delete on creative_asset_links
  for delete using (can_see_creative_as_staff(creative_id));

-- Into the project's Activity Log, as other edits to a post are.
create or replace function creative_asset_links_log()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid := coalesce(new.creative_id, old.creative_id);
  c record;
begin
  select project_id, name into c from creatives where id = v_id;
  if found then
    perform log_project_activity(c.project_id, v_id, 'post_edited',
      jsonb_build_object('post', c.name, 'fields', jsonb_build_array('Final Asset')));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger creative_asset_links_log
  after insert or update of url or delete on creative_asset_links
  for each row execute function creative_asset_links_log();

notify pgrst, 'reload schema';
