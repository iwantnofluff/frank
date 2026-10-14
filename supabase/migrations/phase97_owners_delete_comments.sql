-- Phase 97 — Owners delete comments.
--
-- Decided directly (14 Oct 2026): the Primary Owner and Owners can delete
-- any comment on a post, their team's or a client's; deleting one takes
-- its replies with it (decided directly). A deleted comment keeps its row
-- with deleted_at set, as the schema has always allowed for, and every
-- reader already leaves those out (the post page, live updates, a review
-- link's get_shared_review).
--
-- comments_update_own lets any staff member change a comment they can see
-- (to resolve it, or make it public), so nothing stopped them setting
-- deleted_at too. This guard keeps deleting, and undoing it, to Owners
-- and the Primary Owner. The service role (no caller) is left alone.

create or replace function comments_delete_owners_only()
returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if new.deleted_at is distinct from old.deleted_at
     and auth.uid() is not null
     and not is_agency_owner_or_above(old.agency_id) then
    raise exception 'Only Owners can delete a comment';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_delete_owners_only on comments;
create trigger comments_delete_owners_only
  before update of deleted_at on comments
  for each row execute function comments_delete_owners_only();
