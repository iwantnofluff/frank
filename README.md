# Frank

A multi-tenant SaaS for agency content planning, review and client approval. Next.js App Router, TypeScript, Supabase (Postgres + Auth + Storage), Zustand for light UI state, TanStack Query for all server state.

The UI source of truth is `project-details/frank-prototype.html`, a static HTML/CSS/JS prototype. It is read-only — never edit it. Every authenticated screen in the app is meant to be a faithful CSS/DOM port of the matching screen in that file; see the `prototype-parity` skill (`.claude/skills/prototype-parity/`) for the working method, and `docs/css-coverage.md` / `docs/parity-gaps.md` for the current state of that port.

## Prerequisites

- Node 20.6 or later. Some scripts in this repo (`scripts/*.mjs`) use the built-in `process.loadEnvFile`, which needs it.
- A Supabase project (see below).

## Environment variables

Copy these into `.env.local` at the repo root (gitignored — never commit it):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

All three come from your Supabase project's dashboard, under **Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL` — the Project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` `public` key. Safe to expose client-side; RLS is what actually restricts it.
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` key. **Never expose this to the client or commit it.** It bypasses RLS entirely. It's used server-side only (`app/api/shared-review/route.ts`, for signing Storage URLs) and in one-off Node scripts under `scripts/` and `tests/e2e/fixtures.ts` for test/audit data seeding. See the "seeding through the service-role client" note in `frank-conventions` before writing anything new that uses it — it has no `auth.uid()`, and several triggers key off caller identity.

## Supabase project setup

1. Create a new Supabase project.
2. In the SQL editor, run `supabase/seed.sql` in full. It's a complete schema — every table, type, RLS policy, trigger and helper function needed, including everything phases 1 through 8 added (confirmed against the live project this was developed against; see `docs/phase5-baseline-note.md` for how that was verified). You do not need to also run anything under `supabase/migrations/` — those are the incremental history of how the current project's schema got here, already folded into `seed.sql`, not additional setup steps for a fresh one.
3. In **Storage**, confirm the `assets` bucket exists (created by `seed.sql`'s storage section) and is **not** public — files are only ever reached through signed URLs.
4. In **Authentication → Providers**, email/password is all this app currently uses. No further provider setup needed.
5. Create your first user through Supabase Auth (dashboard or `auth.admin.createUser`), then give them a `public.users` row and an agency `membership` with `role = 'admin'` and `client_id = null` — there's no self-serve signup or invite flow yet, so the first account has to be seeded directly.

## Commands

```bash
npm run dev        # dev server, localhost:3000
npm run build      # production build
npm run start      # run a production build
npm run lint       # eslint
npm run test:e2e   # Playwright visual-regression suite (tests/e2e/)
```

`test:e2e` requires the dev server already running on port 3000 and `SUPABASE_SERVICE_ROLE_KEY` set — it creates and tears down real, throwaway data through the service-role key for each test (see `tests/e2e/fixtures.ts`). It compares screenshots against baselines committed under `tests/e2e/*-snapshots/`; to update a baseline after an intentional UI change, run `npm run test:e2e -- --update-snapshots` and review the diff before committing the new image.

## `proxy.ts`, not `middleware.ts`

Auth routing lives in `proxy.ts` at the repo root. This is Next 16's renamed `middleware.ts` — **`middleware.ts` does not exist in this codebase and never will.** If routing/auth seems broken, start there.

## Where things live

- `app/` — routes (App Router). `(app)/` is the authenticated shell; `login/` and `review/[token]/` are public.
- `components/` — one directory per feature area.
- `hooks/` — every piece of server state, one TanStack Query hook per resource. Components never call `fetch` or `supabase-js` directly.
- `app/globals.css` — hand-ported plain CSS from the prototype. No Tailwind, no CSS-in-JS, no component library.
- `supabase/` — `seed.sql` (full schema) and `migrations/` (incremental history from `phase6_shared_links.sql` onward, plus `phase0_baseline.sql`, a reconstruction of what predates it — see `docs/phase5-baseline-note.md`).
- `docs/` — `css-coverage.md` (prototype-vs-app CSS audit), `parity-gaps.md` (things the prototype does that the app deliberately doesn't yet, and why), `comment-visibility-verification.md`, `phase5-baseline-note.md`.
- `.claude/skills/` — `frank-conventions` and `prototype-parity`, the standing rules for working in this codebase.
