# Phase 5 — baseline schema reconstruction

Was a forward-looking note; now a record of what was done.

## What `supabase/seed.sql` turned out to be

Not a fresh-install convenience script. It's the full current schema — every table, RLS policy, helper function and trigger, including phases 6, 7 (with its search_path fix) and 8 already folded in. Confirmed structurally, not just by reading it: it contains `shared_links`/`agency_settings`/the storage bucket policies (phases 6-8) in the same file as the phase 1-5 tables, and its copies of `get_shared_review()`/`submit_shared_comment()`/`submit_shared_approval()` already have `search_path = public, extensions` — the fix from `phase7_fix_pgcrypto_search_path.sql`, not the original buggy version from `phase6_shared_links.sql`. If it were a stale snapshot, it would have the bug.

## How complete it is against the live database — verified, not assumed

Checked via the service-role client (read-only throughout, nothing applied):

- **All 15 declared tables exist live.**
- **Every declared column on every one of those tables exists live** — checked by selecting each table's exact declared column list explicitly (`select <list> limit 0`), which fails immediately on any column PostgREST can't resolve. All 15 passed with zero missing columns.
- **All 9 declared RPC/helper functions are callable live** (`current_agency_ids`, `is_agency_staff`, `is_agency_admin`, `current_client_ids`, `create_shared_link`, `shared_link_allowed_creative_ids`, `get_shared_review`, `submit_shared_comment`, `submit_shared_approval`) — called each with dummy arguments and confirmed the error (where there was one) was a validation failure, not "function does not exist."
- **One RLS policy and one trigger verified behaviourally**, not just by reading the text: `comments_select` and `comments_enforce_visibility`, during the comment-visibility investigation (`docs/comment-visibility-verification.md`). Both behave exactly as `seed.sql` declares.

## What it doesn't cover — said plainly

- **Whether the live database has anything `seed.sql` doesn't declare.** The verification above can only confirm declared objects exist; it's blind to undeclared extra tables, columns, or functions. Nothing queryable through PostgREST would surface that.
- **Exact RLS policy text and trigger definitions beyond the one pair checked behaviourally.** Every other policy and trigger in `phase0_baseline.sql` is transcribed from `seed.sql`, not independently re-verified against live behaviour one by one.
- **Constraints, foreign keys, index definitions** — same limitation as above.
- **Anything outside `public`/`storage` schema DDL** — auth configuration, extension versions, project-level settings.

Closing any of these needs a direct Postgres connection (a database password — this project only has the service-role API key) or Supabase Management API / MCP access. Neither is available in this environment. `phase0_baseline.sql` records this same list at its own end, so it travels with the file.

## What was produced

`supabase/migrations/phase0_baseline.sql` — `seed.sql`'s content for everything not already covered by the four existing migration files, extracted (not retyped) with exactly two adjustments needed to stay replayable in sequence before them: `creatives` omits the three columns `phase6_shared_links.sql` adds by `ALTER TABLE`, and `comments` omits the two guest columns (and keeps `author_id` `NOT NULL`) for the same reason. Not applied to the live project.
