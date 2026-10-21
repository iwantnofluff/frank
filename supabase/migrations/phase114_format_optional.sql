-- Phase 114 — a post's format can wait.
--
-- Decided directly (21 Oct 2026): ideas and concepts can be made without a
-- format; the table offers Add Format until one is chosen. creatives.format
-- (the main format, kept beside formats, the full list, phase29) may now
-- be empty; formats already defaulted to an empty list. A post without a
-- format has no copy fields or artwork shape until it gets one, so its
-- content can't be added before then, and so it can't move past Concept
-- by itself (content is what moves it, phase13).

alter table creatives alter column format drop not null;

-- Keeping format and formats in step (phase29), now that both can be
-- empty: no main format, no list (not a list of one empty format).
create or replace function sync_creative_formats()
returns trigger language plpgsql as $$
begin
  if new.formats is null or array_length(new.formats, 1) is null then
    new.formats := case when new.format is null then '{}'::text[] else array[new.format] end;
  elsif tg_op = 'UPDATE' and new.format is distinct from old.format and new.formats = old.formats then
    -- An older write changed only `format`: it replaces the main one.
    new.formats := case
      when new.format is null then '{}'::text[]
      else array[new.format] || array_remove(new.formats[2:], new.format)
    end;
  else
    new.format := new.formats[1];
  end if;
  return new;
end;
$$;
