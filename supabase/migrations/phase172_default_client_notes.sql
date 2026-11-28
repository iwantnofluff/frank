-- Default Discovery notes (direct instruction, 28 Nov 2026): every client
-- starts with notes to fill in, each reading "Pending" until it's written.
-- Client Rules (the protected_terms section, renamed in the app): Copy Do's,
-- Copy Don'ts, Creative Do's, Creative Don'ts. Target Audience: Primary TG,
-- Secondary TG. Frank skips a note while it reads "Pending"
-- (lib/knowledge-sections.ts, isPendingNote).
--
-- Added by the database when a client is made, so every way of making one
-- gets them; not the sample client, which brings its own. Existing clients
-- get whichever they don't already have (decided directly), by title within
-- the section; notes already there are left as they are.

create or replace function default_client_notes()
returns table (section text, title text, pos int)
language sql immutable set search_path = public, extensions as $$
  values
    ('protected_terms', 'Copy Do''s', 1),
    ('protected_terms', 'Copy Don''ts', 2),
    ('protected_terms', 'Creative Do''s', 3),
    ('protected_terms', 'Creative Don''ts', 4),
    ('audience', 'Primary TG', 1),
    ('audience', 'Secondary TG', 2);
$$;

create or replace function add_default_client_notes(p_client_id uuid)
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_client clients;
  v_added int;
begin
  select * into v_client from clients where id = p_client_id;
  if not found or v_client.is_sample then
    return 0;
  end if;
  insert into knowledge_entries (agency_id, client_id, section, kind, title, body, author_id, created_at)
  select v_client.agency_id, v_client.id, d.section, 'text', d.title, 'Pending', auth.uid(),
         -- A moment apart, so they list in order.
         now() + make_interval(secs => d.pos / 1000.0)
  from default_client_notes() d
  where not exists (
    select 1 from knowledge_entries k
    where k.client_id = v_client.id and k.section = d.section and lower(k.title) = lower(d.title)
  );
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

revoke all on function add_default_client_notes(uuid) from public, anon, authenticated;

create or replace function clients_add_default_notes()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform add_default_client_notes(new.id);
  return new;
end;
$$;

drop trigger if exists clients_add_default_notes on clients;
create trigger clients_add_default_notes
  after insert on clients
  for each row execute function clients_add_default_notes();

-- Existing clients.
select count(*) as clients, sum(add_default_client_notes(id)) as notes_added
from clients where not is_sample;
