-- Phase 131 — summaries for the admin area (decided directly, 2 Nov 2026),
-- added up in the database rather than by fetching every row. For Frank's
-- server alone (the service role): nobody signed in can call them.

-- AI use by month, workspace, model and feature (phase128's tokens,
-- phase130's task). with_tokens counts the requests that recorded tokens,
-- so the admin can say how many couldn't be priced.
-- month is "2026-11", in UTC.
drop function if exists admin_ai_usage_by_month(timestamptz);
create function admin_ai_usage_by_month(p_since timestamptz)
returns table (
  month text, agency_id uuid, model text, task text,
  requests int, with_tokens int, input_tokens bigint, cache_read_tokens bigint, output_tokens bigint
)
language sql stable security definer set search_path = public, extensions as $$
  select to_char(e.created_at at time zone 'UTC', 'YYYY-MM'), e.agency_id, e.model, e.task,
    count(*)::int, count(e.input_tokens)::int,
    coalesce(sum(e.input_tokens), 0)::bigint, coalesce(sum(e.cache_read_tokens), 0)::bigint,
    coalesce(sum(e.output_tokens), 0)::bigint
  from ai_usage_events e
  where e.created_at >= p_since
  group by 1, 2, 3, 4;
$$;
revoke execute on function admin_ai_usage_by_month(timestamptz) from public, anon, authenticated;

-- Every workspace's files in the assets bucket, as agency_storage_used
-- (phase41) counts them for one; and everything stored, by bucket, to set
-- against what the Supabase plan includes.
create or replace function admin_storage_by_agency()
returns table (agency_id uuid, bytes bigint)
language sql stable security definer set search_path = public, extensions as $$
  select split_part(o.name, '/', 1)::uuid, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'assets'
    and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  group by 1;
$$;
revoke execute on function admin_storage_by_agency() from public, anon, authenticated;

create or replace function admin_storage_by_bucket()
returns table (bucket text, bytes bigint, files int)
language sql stable security definer set search_path = public, extensions as $$
  select o.bucket_id, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint, count(*)::int
  from storage.objects o
  group by 1;
$$;
revoke execute on function admin_storage_by_bucket() from public, anon, authenticated;
