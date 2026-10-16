-- Phase 104 — clear a stuck API connection by itself.
--
-- Seen on live (16 Oct 2026, twice in ten minutes): one of PostgREST's
-- pooled connections was left "idle in transaction (aborted)" after a
-- failed request, and every request handed to it failed with 25P02
-- ("current transaction is aborted"): about one in eight. Pages half
-- loaded, a share link was made but never shown, and a sign-in check
-- failed, so its person was told they weren't in the workspace. PostgREST
-- recycled it after a few minutes; nothing of Frank's was involved.
--
-- Decided directly: every 10 seconds, any PostgREST connection stuck like
-- that for over 10 seconds is closed (it's doing nothing, so nothing is
-- lost; PostgREST opens a fresh one), and logged, to see how often it
-- happens. pg_cron is Supabase's own scheduler, switched on here.

create extension if not exists pg_cron;

-- Each one closed, for a report to Supabase.
create table if not exists api_connection_resets (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  pid int not null,
  stuck_since timestamptz,
  last_query text
);
alter table api_connection_resets enable row level security;
-- No policies: read with the service role or the SQL editor only.

create or replace function clear_stuck_api_connections()
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_closed int := 0;
begin
  for r in
    select pid, state_change, left(query, 200) as q
    from pg_stat_activity
    where application_name like 'PostgREST%'
      and state = 'idle in transaction (aborted)'
      and state_change < now() - interval '10 seconds'
  loop
    if pg_terminate_backend(r.pid) then
      insert into api_connection_resets (pid, stuck_since, last_query) values (r.pid, r.state_change, r.q);
      v_closed := v_closed + 1;
    end if;
  end loop;
  return v_closed;
end;
$$;
revoke execute on function clear_stuck_api_connections() from public, anon, authenticated;

-- Every 10 seconds; scheduling again under the same name replaces it.
select cron.schedule('clear-stuck-api-connections', '10 seconds', 'select public.clear_stuck_api_connections()');

-- pg_cron logs every run; keep a day of it.
select cron.schedule(
  'trim-cron-run-history',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '1 day'$$
);
