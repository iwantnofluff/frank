# Comment visibility — verification

How `comments.visibility` ("private"/internal vs "public") is actually enforced across the two paths that read comments, verified empirically against the live database rather than assumed from reading the schema. No remediation plan here by design — that's a separate decision. This file is for reproducing the checks, not for deciding what (if anything) to do about the result.

## Result

Both read paths enforce the internal/public split correctly.

- **Authenticated, in-app read** (a client-role user's own session querying `comments` directly): enforced by the `comments_select` row-level security policy (`supabase/seed.sql`) — `is_agency_staff(agency_id) or (visibility = 'public' and ...)`. A client-role user's session cannot see a private comment.
- **Unauthenticated, share-link read** (`POST /api/shared-review`, no session at all): enforced by `get_shared_review()`, a `SECURITY DEFINER` Postgres function (`supabase/migrations/phase6_shared_links.sql`) with an explicit `where cm.visibility = 'public'` filter on its comments subquery, not by RLS (the function bypasses RLS by design — see the file header comment in that migration). A visitor with just the link URL and no session cannot see a private comment.

## The retraction

An earlier pass at this same question concluded the opposite for the authenticated path — that RLS did not filter by visibility at all. That conclusion was wrong, and wrong for a specific, reproducible reason (below), not a difference of interpretation. It does not stand; this document supersedes it.

## The trigger gotcha that caused the wrong result

`comments_enforce_visibility()` (`supabase/seed.sql`) is a `before insert or update` trigger:

```sql
if not is_agency_staff(comment_agency_id) then
  new.visibility := 'public';
end if;
```

`is_agency_staff()` checks `auth.uid()`. The Supabase **service-role client has no `auth.uid()`** — it isn't signed in as anyone, it bypasses auth entirely. So any comment inserted through the service-role client — which is exactly how both this project's throwaway test fixtures and its `visual-qa.spec.ts` seeding create rows — gets silently coerced to `visibility = 'public'` by this trigger, regardless of what the insert asked for.

The earlier check inserted its "private" comment through the service-role client, got back `'public'` when it read the row straight back, and never noticed — it went on to test whether a client-role user could see "the private comment," which by that point had never actually been private. Of course it came back; it was public. The RLS policy was never exercised against a genuinely private row.

## How to reproduce this correctly

The fix is to insert the comment through a **real authenticated session** — a signed-in staff user, via the anon key and a real `signInWithPassword` call — exactly the way `hooks/use-create-comment.ts` does it in the app, not through the service-role client. Under that session, `auth.uid()` resolves to the staff user, `is_agency_staff(agency_id)` is true, and the trigger leaves `visibility` alone.

Reproduction shape (a throwaway fixture, cleaned up after, same pattern as `visual-qa.spec.ts`):

1. Service-role client creates: an agency, a staff user, a client-role user, a client, a project, and a creative at `stage: 5` (the minimum `shared_link_allowed_creative_ids` will ever include — stage below 5 is excluded unconditionally regardless of scope). Also insert a `shared_links` row directly via the service-role client for the token check (`shared_links` itself isn't subject to the visibility trigger, so this part is fine to seed directly).
2. **Sign in as the staff user** (anon key, real password auth). Through that session's own client, insert one comment with `visibility: 'private'` and one with `visibility: 'public'`, both with `author_id` set from that session's own `auth.getUser()` — matching `use-create-comment.ts` exactly.
3. Read both rows back immediately and confirm the stored `visibility` matches what was requested (`private` really is `private`) before checking anything else. Skipping this step is exactly how the first attempt went wrong.
4. **Check A — authenticated path:** sign in as the client-role user (a second real session), query `comments` for that creative directly, and check whether the private comment's id appears in the result. Result: it does not; only the public one does.
5. **Check B — token path:** with no session of any kind, plain `fetch(...)` a `POST` to `/api/shared-review` on the real running dev server with `{ token, passcode: null }`. Check whether the private comment's id appears in `creatives[].comments`. Result: it does not; only the public one does.
6. Clean up everything created in reverse dependency order (comments, shared_links, creative, project, client, memberships, agency, users, both auth users), same as `visual-qa.spec.ts`'s `afterAll`.

Nothing in the app, its policies, or its functions was changed to produce this result — both checks are read-only against the existing schema.

## What's actually enforcing the split, for reference

- Authenticated reads: `comments_select` RLS policy on the `comments` table (`supabase/seed.sql`).
- Token/public reads: the explicit `visibility = 'public'` filter inside `get_shared_review()`'s comments subquery (`supabase/migrations/phase6_shared_links.sql`, re-affirmed unchanged in `phase7_fix_pgcrypto_search_path.sql`).
- Writes: `comments_enforce_visibility()` trigger forces `visibility` to `'public'` for anyone the trigger doesn't recognise as agency staff via `is_agency_staff(agency_id)` (which itself depends on `auth.uid()`) — this is what a client-side author's comment always being public actually rests on, and it's also the mechanism that made the first verification attempt wrong when tested from a context with no `auth.uid()` at all.

## Interaction with the CSS parity work

The Phase 2 CSS pass that restored `.cmt.internal`/`.intog:has(input:checked)`/`.intog .lockic` and fixed the icon's polarity (lock now shows on the internal/checked state, not a globe) made the internal/public distinction more visible and more confidence-inspiring in the UI than it was before that pass. That work only touched presentation — it did not change, and was never intended to change, what's actually enforcing the split described above. The enforcement was already correct before that CSS landed; the UI now represents it more clearly, which is a separate improvement from whether the underlying access control is sound.
