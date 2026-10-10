-- Phase 88 — a post's VO (voiceover) script.
--
-- Decided directly (10 Oct 2026): a VO section in the post's window,
-- after the Creative, for video formats. The script only (no audio file),
-- saved on the post with its own Save, the way Text on Image is
-- (phase57), not as a copy version. Shown on the project table as a VO
-- column and drafted by Draft with Frank; not shown to clients (the
-- review link's RPCs don't return it).
--
-- RLS is by row, as for every other column on creatives: whoever can edit
-- the post can edit its VO.

alter table creatives add column if not exists voiceover text
  check (voiceover is null or char_length(voiceover) <= 5000);

-- The Activity Log names a change to it as "VO" (phase87's body, plus
-- that one line).
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
  if new.team_user_ids is distinct from old.team_user_ids then v_fields := array_append(v_fields, 'Team'); end if;
  if new.concept is distinct from old.concept then v_fields := array_append(v_fields, 'Concept'); end if;
  if new.reference_urls is distinct from old.reference_urls then v_fields := array_append(v_fields, 'References'); end if;
  if new.slide_count is distinct from old.slide_count then v_fields := array_append(v_fields, 'Slides'); end if;
  if new.scheduled_at is distinct from old.scheduled_at then v_fields := array_append(v_fields, 'Live date'); end if;
  if new.due_on is distinct from old.due_on then v_fields := array_append(v_fields, 'Due date'); end if;
  if new.destination is distinct from old.destination then v_fields := array_append(v_fields, 'Destination'); end if;
  if new.slide_text is distinct from old.slide_text then v_fields := array_append(v_fields, 'Text on Image'); end if;
  if new.voiceover is distinct from old.voiceover then v_fields := array_append(v_fields, 'VO'); end if;
  if array_length(v_fields, 1) > 0 then
    perform log_project_activity(new.project_id, new.id, 'post_edited',
      jsonb_build_object('post', new.name, 'fields', to_jsonb(v_fields)));
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
