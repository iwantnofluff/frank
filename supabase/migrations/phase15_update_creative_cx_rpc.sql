-- update_creative_cx: an atomic single-field write into creatives.cx -------
-- The client previously did this as fetch-then-merge (read cx, merge one
-- key in application code, write the whole blob back) — fine for one editor
-- touching one field at a time, but a real race once a single row has
-- several cx-backed fields that get edited in quick succession (the
-- continuous-delivery content-planner template: Funnel/TG/Type/Final
-- Creative/V1 Copy/V2 Copy/Principles, all on one row): editing two fields
-- back-to-back can lose the first edit, since the second field's fetch
-- reads a cx blob that doesn't yet include the first field's write.
--
-- jsonb_set inside a single UPDATE statement is atomic per Postgres's own
-- MVCC guarantees — no fetch-then-merge round trip, so no window for this
-- race. No SECURITY DEFINER: this runs as the calling role, so the
-- existing creatives_update RLS policy (staff-only) still governs it
-- exactly the way it already governs the plain-table-write path — a
-- blocked caller simply gets zero rows back, the same silent-no-op shape
-- every other mutation hook in this app already guards against.
--
-- p_value_json is a JSON-encoded *string* (the client always calls
-- JSON.stringify(value), even for null), not a jsonb parameter directly —
-- PostgREST maps a bare JSON null in an RPC's jsonb-typed argument to a SQL
-- NULL, and jsonb_set(cx, path, NULL) returns NULL for the whole column,
-- wiping every other key. Casting a text '"null"'/'null' literal to jsonb
-- inside the function sidesteps that ambiguity entirely.
create or replace function update_creative_cx(p_creative_id uuid, p_key text, p_value_json text)
returns creatives
language sql
as $$
  update creatives
  set cx = jsonb_set(coalesce(cx, '{}'::jsonb), array[p_key], p_value_json::jsonb, true)
  where id = p_creative_id
  returning *;
$$;

grant execute on function update_creative_cx(uuid, text, text) to authenticated;
