-- Phase 26b — title_case() capitalises after an apostrophe too.
--
-- phase26's title_case() leaned on Postgres's initcap(), which treats an
-- apostrophe as part of the word: "o'neil" came back "O'neil", not
-- "O'Neil" (found by writing it through the real trigger, not by reading
-- the docs). The app's live preview (lib/title-case.ts) already
-- capitalised after any non-letter, so the two disagreed. This replaces
-- initcap() with the same rule: an all-lowercase word gets a capital at
-- its start and after every character that isn't a letter or digit.
-- Nothing else about the function changes, and no existing name in the
-- database contains an apostrophe, so there's nothing to re-normalise.

create or replace function title_case(input text)
returns text
language plpgsql immutable as $$
declare
  words text[];
  w text;
  i int;
  j int;
  ch text;
  built text;
  prev_alnum boolean;
  result text[] := '{}';
  minor constant text[] := array['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'];
begin
  if input is null or btrim(input) = '' then
    return null;
  end if;
  words := regexp_split_to_array(btrim(regexp_replace(input, '\s+', ' ', 'g')), ' ');
  for i in 1 .. array_length(words, 1) loop
    w := words[i];
    if i > 1 and lower(w) = any(minor) then
      result := result || lower(w);
    elsif w = lower(w) then
      built := '';
      prev_alnum := false;
      for j in 1 .. length(w) loop
        ch := substr(w, j, 1);
        built := built || case when prev_alnum then ch else upper(ch) end;
        prev_alnum := ch ~ '[[:alnum:]]';
      end loop;
      result := result || built;
    else
      result := result || (upper(left(w, 1)) || substr(w, 2));
    end if;
  end loop;
  return array_to_string(result, ' ');
end;
$$;
