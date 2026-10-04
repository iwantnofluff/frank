-- Phase 52 — conversations with Claude about a post's copy.
--
-- Decided directly (4 Oct 2026): "Write with Claude" opens a conversation
-- for a post: Claude drafts copy from the concept, or reviews the team's
-- own draft, with the agency's and client's knowledge, the format's
-- direction and the brief as context. Conversations are kept with the post
-- so the team can see how the copy got there. Staff only: a Client never
-- sees them. Each message is one AI request against the monthly cap
-- (through runAiTask, which logs it).

create table copy_chats (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  creative_id uuid not null references creatives (id) on delete cascade,
  -- How it started: drafting from the concept, or reviewing a draft.
  mode text not null check (mode in ('draft', 'review')),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index copy_chats_creative_idx on copy_chats (creative_id, updated_at desc);
create trigger copy_chats_set_agency_id
  before insert or update of creative_id on copy_chats
  for each row execute function set_agency_id_from_creative();
create trigger zz_read_only_guard before insert or update or delete on copy_chats
  for each row execute function block_writes_when_read_only();

create table copy_chat_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies (id),
  chat_id uuid not null references copy_chats (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(body) <= 20000),
  -- Claude's drafts in this reply, each a set of copy fields to use.
  drafts jsonb not null default '[]'::jsonb,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index copy_chat_messages_chat_idx on copy_chat_messages (chat_id, created_at);

create or replace function set_agency_id_from_copy_chat()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  select agency_id into strict new.agency_id from copy_chats where id = new.chat_id;
  return new;
end;
$$;
create trigger copy_chat_messages_set_agency_id
  before insert or update of chat_id on copy_chat_messages
  for each row execute function set_agency_id_from_copy_chat();
create trigger zz_read_only_guard before insert or update or delete on copy_chat_messages
  for each row execute function block_writes_when_read_only();

-- Staff who can see the post's project. Never a Client.
create or replace function can_see_creative_as_staff(p_creative_id uuid)
returns boolean
language sql security definer stable set search_path = public, extensions as $$
  select exists (
    select 1 from creatives c
    where c.id = p_creative_id
      and c.project_id in (select staff_visible_project_ids(c.agency_id))
  );
$$;

alter table copy_chats enable row level security;
create policy copy_chats_select on copy_chats
  for select using (can_see_creative_as_staff(creative_id));
create policy copy_chats_insert on copy_chats
  for insert with check (can_see_creative_as_staff(creative_id) and created_by = auth.uid());
create policy copy_chats_update on copy_chats
  for update using (can_see_creative_as_staff(creative_id));

alter table copy_chat_messages enable row level security;
create policy copy_chat_messages_select on copy_chat_messages
  for select using (exists (select 1 from copy_chats ch where ch.id = chat_id and can_see_creative_as_staff(ch.creative_id)));
create policy copy_chat_messages_insert on copy_chat_messages
  for insert with check (exists (select 1 from copy_chats ch where ch.id = chat_id and can_see_creative_as_staff(ch.creative_id)));
