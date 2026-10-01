-- Phase 29 — a post can have several formats.
--
-- A post's formats are multi-choice, from any content type, and its copy
-- fields are the union of every chosen format's (the app combines them;
-- nothing here needs to know a format's fields).
--
-- creatives.formats holds them all, in the order chosen. creatives.format
-- stays — every existing reader (the shared-review RPC, comment
-- classification, the Feed Preview's tile shape) keeps working against the
-- first one, and the trigger below is what keeps the two in step: a write
-- that only sets `format` (anything older) gets formats = [format]; a write
-- that sets `formats` gets format = formats[1].

alter table creatives add column formats text[] not null default '{}';

update creatives set formats = array[format] where formats = '{}';

create or replace function sync_creative_formats()
returns trigger language plpgsql as $$
begin
  if new.formats is null or array_length(new.formats, 1) is null then
    new.formats := array[new.format];
  elsif tg_op = 'UPDATE' and new.format is distinct from old.format and new.formats = old.formats then
    -- An older write changed only `format`: it replaces the main one.
    new.formats := array[new.format] || array_remove(new.formats[2:], new.format);
  else
    new.format := new.formats[1];
  end if;
  return new;
end;
$$;

create trigger creatives_sync_formats
  before insert or update on creatives
  for each row execute function sync_creative_formats();
