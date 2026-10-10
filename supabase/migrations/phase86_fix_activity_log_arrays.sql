-- Phase 86 — re-apply phase84's two activity-log trigger functions.
--
-- On live, saving a post's Text on Image failed with "malformed array
-- literal" (10 Oct 2026): live has the first draft of these functions,
-- which joined a field name onto the list as if it were another list.
-- phase84's file was corrected (array_append) and staging has that
-- version; this puts the same corrected bodies on live. Every post and
-- project edit goes through them. Safe to run again.

create or replace function creatives_log_activity()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_fields text[] := '{}';
begin
  if tg_op = 'DELETE' then
    perform log_project_activity(old.project_id, null, 'post_deleted', jsonb_build_object('post', old.name));
    return old;
  end if;
  if old.archived_at is null and new.archived_at is not null then
    perform log_project_activity(new.project_id, new.id, 'post_archived', jsonb_build_object('post', new.name));
  elsif old.archived_at is not null and new.archived_at is null then
    perform log_project_activity(new.project_id, new.id, 'post_restored', jsonb_build_object('post', new.name));
  end if;
  if new.name is distinct from old.name then v_fields := array_append(v_fields, 'Name'); end if;
  if new.formats is distinct from old.formats or new.format is distinct from old.format then v_fields := array_append(v_fields, 'Format'); end if;
  if new.lead_user_id is distinct from old.lead_user_id then v_fields := array_append(v_fields, 'Lead'); end if;
  if new.concept is distinct from old.concept then v_fields := array_append(v_fields, 'Concept'); end if;
  if new.reference_urls is distinct from old.reference_urls then v_fields := array_append(v_fields, 'References'); end if;
  if new.slide_count is distinct from old.slide_count then v_fields := array_append(v_fields, 'Slides'); end if;
  if new.scheduled_at is distinct from old.scheduled_at then v_fields := array_append(v_fields, 'Live date'); end if;
  if new.due_on is distinct from old.due_on then v_fields := array_append(v_fields, 'Due date'); end if;
  if new.destination is distinct from old.destination then v_fields := array_append(v_fields, 'Destination'); end if;
  if new.slide_text is distinct from old.slide_text then v_fields := array_append(v_fields, 'Text on Image'); end if;
  if array_length(v_fields, 1) > 0 then
    perform log_project_activity(new.project_id, new.id, 'post_edited',
      jsonb_build_object('post', new.name, 'fields', to_jsonb(v_fields)));
  end if;
  return new;
end;
$$;

create or replace function projects_log_activity()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_fields text[] := '{}';
begin
  if new.name is distinct from old.name then
    perform log_project_activity(new.id, null, 'project_renamed', jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  if old.archived_at is null and new.archived_at is not null then
    perform log_project_activity(new.id, null, 'project_archived', '{}');
  elsif old.archived_at is not null and new.archived_at is null then
    perform log_project_activity(new.id, null, 'project_restored', '{}');
  end if;
  if new.type is distinct from old.type then v_fields := array_append(v_fields, 'Type'); end if;
  if new.due_on is distinct from old.due_on then v_fields := array_append(v_fields, 'Due date'); end if;
  if new.description is distinct from old.description then v_fields := array_append(v_fields, 'Description'); end if;
  if new.icon is distinct from old.icon then v_fields := array_append(v_fields, 'Picture'); end if;
  if array_length(v_fields, 1) > 0 then
    perform log_project_activity(new.id, null, 'project_details', jsonb_build_object('fields', to_jsonb(v_fields)));
  end if;
  if new.folder_id is distinct from old.folder_id then
    perform log_project_activity(new.id, null, 'project_folder',
      jsonb_build_object('folder', (select name from project_folders where id = new.folder_id)));
  end if;
  if new.client_id is distinct from old.client_id then
    perform log_project_activity(new.id, null, 'project_client',
      jsonb_build_object('from', (select name from clients where id = old.client_id), 'to', (select name from clients where id = new.client_id)));
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
