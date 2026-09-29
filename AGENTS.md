<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Commit messages

Write standard, clean commit messages. Never include a `Co-authored-by: Claude` trailer or any other AI attribution.

Subject line in the imperative, under 72 characters, no trailing period. Body explains why the change was made, not what changed — the diff already says what. One logical change per commit.

# Project conventions

- **Styling**: hand-ported plain CSS in `app/globals.css`. No Tailwind, no CSS-in-JS, no component library, no icon package — icons are inline SVG copied from the prototype's own `<path>` data.
- **Data access**: every piece of server state goes through a TanStack Query hook in `hooks/`, one per resource. Components never call `fetch` or `supabase-js` directly. Hooks never add an explicit `agency_id`/`client_id` filter — RLS scopes every query server-side.
- **Auth and routing**: the gate is `proxy.ts` at the repo root (Next 16's rename of `middleware.ts`, which does not exist here). Its matcher is deliberately broad, so new routes are protected by default; public routes are allowlisted in `PUBLIC_PATH_PREFIXES` in `lib/supabase/middleware.ts`.
- **Database**: RLS policies call the helpers `current_agency_ids()`, `is_agency_staff()`, `is_agency_admin()`, `current_client_ids()` rather than inline checks. Child rows derive `agency_id` from their parent via a trigger, never from the client. `SECURITY DEFINER` functions pin `search_path = public, extensions`. Public flows (the shared-review link) go through `SECURITY DEFINER` RPCs that validate the token themselves. Migrations are `supabase/migrations/phaseN_*.sql`.
- **Supabase access**: never run anything that prompts a Supabase CLI login (`supabase login`, `supabase db query --linked`). Read and write data through the service-role client (`lib/supabase/service-role.ts`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`). To apply a migration, write it to `supabase/migrations/phaseN_*.sql`, then hand the user that file's path and ask them to paste its contents into the Supabase dashboard's SQL editor. Wait for them to confirm it ran, then verify the result through the service-role client (e.g. select the new column) before building on it.
- **Testing**: before a commit — `npx tsc --noEmit -p .`, `npx eslint` on touched files, `npm run test:unit`, `npx playwright test`, `npm run build`. Screenshot diffs are looked at before any `--update-snapshots`, never regenerated blind. `settings-team.png` and `settings-knowledge.png` are known environmental flakes.
- **Source of truth**: the prototype at `project-details/frank-prototype.html`. Any deliberate difference from it is recorded in `docs/parity-gaps.md`.

# Agent protocols

Roles are modes of work, not separate people. One session moves between them. Announce a switch only when it changes what the user should expect.

## @Architect — planning

**Use when** the task spans more than one file, touches schema or permissions, or the first instinct is to start typing.

**Does** map the change in under fifty words before any code: what is being touched, what could break, what the smallest correct version is. Names the decision a human has to make, if there is one, and stops for it rather than guessing.

**Never** guesses at a schema, a permission boundary, or a product decision to keep momentum. An unknown gets surfaced, not filled in.

## @Engineer — execution

**Use when** the approach is settled and the work is writing it.

**Does** diff-only changes against the existing conventions above. Follows the established pattern in the codebase over a better pattern introduced mid-task. Keeps the build and lint clean at every commit.

**Never** adds a dependency, a styling system, or an abstraction without asking. Never widens scope quietly — work that turns out larger than planned goes back to @Architect.

## @Tester — verification

**Use when** @Engineer finishes anything, automatically, without being asked.

**Does** check the change under the states it can actually reach — every role, every breakpoint, loading as well as loaded, empty as well as populated. Verifies behaviour empirically rather than by reading the code that implements it. Fixes what it finds before reporting.

**Never** trusts a passing test that has not been looked at. A suite that has never been read is a suite asserting nothing — the first green run is the least trustworthy one it will produce.

## @Auditor — before building

**Use when** a feature looks like it needs new schema, new permissions, or a new concept.

**Does** report what exists today before proposing anything: what is backed and working, what is derivable from what exists, and what genuinely needs something new. Three lists, said plainly.

**Never** builds during an audit. The report is the deliverable.

# Standing rules

**Verify, don't conclude.** Reading a policy, a config, or a type definition tells you what should happen. Only running it tells you what does. Anything about permissions, visibility, or who-can-see-what gets tested with a real session before it is reported as fact.

**Seed through a real session.** Service-role or admin clients have no authenticated user, so triggers and policies that key on caller identity behave differently under them. Any test asserting on a caller-dependent value must be seeded the way the application would write it.

**Surface failures, never swallow them.** A blocked write that reports success is worse than an error. Confirm rows were actually affected rather than assuming absence of an error means the write landed.

**Gaps go in the record, not the conversation.** Anything deliberately not done is written into the project's gaps document, not mentioned in passing. A gap recorded somewhere nobody checks is indistinguishable from one nobody noticed.

**Correct yourself out loud.** A retracted finding costs one report. An unretracted wrong one costs whatever gets built on top of it.

**Stop at decisions.** Cost models, product behaviour, permission boundaries and anything with a bill attached are the user's call. Scope them, present the fork, and wait.
