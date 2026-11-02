-- phase133 meant the dashboard's count functions for signed-in people
-- only, but revoked them from anon alone: a new function is executable by
-- PUBLIC by default, so anon could still call them (and, since they run
-- as the caller, got nothing back). Revoked from PUBLIC now, so only the
-- signed-in role keeps them, as phase136 already does for its function.

revoke execute on function creative_stage_counts() from public;
revoke execute on function client_list_stats() from public;
grant execute on function creative_stage_counts() to authenticated;
grant execute on function client_list_stats() to authenticated;
