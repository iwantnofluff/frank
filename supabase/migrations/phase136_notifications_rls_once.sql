-- Notifications' row rules called in_request_agency(agency_id) for every
-- row — reading the request's headers and looking the agency up twice,
-- 200 rows at a time, every minute for everyone with Frank open (the
-- bell's check). The agencies this address allows are now worked out once
-- per request (request_agency_ids) and each row only checked against them
-- (speed pass, 2 Nov 2026). Same meaning, unchanged: your own
-- notifications, in this address's agency (any agency on an address that
-- doesn't name one), never a paused one.

create or replace function request_agency_ids()
returns setof uuid
language sql security definer stable set search_path = public, extensions as $$
  -- case, not or: the headers are only read as JSON once known not to be
  -- empty (or's order isn't guaranteed), as in_request_agency does.
  select a.id from agencies a
  where a.suspended_at is null
    and case
      when coalesce(current_setting('request.headers', true), '') = '' then true
      when coalesce(current_setting('request.headers', true)::json ->> 'x-frank-agency', '') = '' then true
      else a.subdomain = (current_setting('request.headers', true)::json ->> 'x-frank-agency')::citext
    end;
$$;

revoke execute on function request_agency_ids() from public, anon;
grant execute on function request_agency_ids() to authenticated;

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  using (user_id = (select auth.uid()) and agency_id in (select request_agency_ids()));

drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (user_id = (select auth.uid()) and agency_id in (select request_agency_ids()))
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications for delete
  using (user_id = (select auth.uid()) and agency_id in (select request_agency_ids()) and read_at is not null);
