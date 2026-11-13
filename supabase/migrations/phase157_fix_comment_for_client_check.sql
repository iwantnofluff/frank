-- Phase 157 — the team can log a comment for the client on live again.
--
-- On live, logging a comment on the client's behalf (phase149) was refused
-- for everyone: "Only the team can log a comment for the client". Live had
-- phase149's first version of this check, which found the workspace from
-- the comment's own agency_id, not yet filled in when it runs; staging and
-- local had the corrected one, which finds it through the post. This puts
-- the corrected check in place, unchanged from phase149's file. Safe to run
-- anywhere.

create or replace function comments_check_for_client()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.for_client and (
    new.author_id is null
    or not exists (
      select 1 from memberships m join creatives c on c.agency_id = m.agency_id
      where c.id = new.creative_id and m.user_id = new.author_id
        and m.client_id is null and m.removed_at is null
    )
  ) then
    raise exception 'Only the team can log a comment for the client';
  end if;
  return new;
end;
$$;
