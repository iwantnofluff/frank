# Parity gaps

Screens or controls where the prototype does something the live app doesn't, and closing the gap needs more than a CSS/DOM fix — a schema change, a new feature, or a decision this pass isn't positioned to make on its own. See the `prototype-parity` skill for the escalation rule this file exists to serve.

## Upload/Edit modal (established prior to this file's creation)

Scoped out on the grounds that each would require a schema or feature decision, not a styling one:

- **"Which Creative" selector** — the app's modal is always invoked from one specific creative already; the prototype's selector exists because its modal can be opened generically.
- **Content Type / Format selects** — editable in the prototype; changing a creative's format after creation isn't a decision this pass can make.
- **AI vision-caption field** ("What the Artwork Looks Like") — unbuilt AI feature.
- **WIIFM Note input** — would duplicate or conflict with the Brief panel's existing `approach_notes` field; a data-modeling decision.
- **Dual "Save as Coming Soon" / "Send for Review" footer buttons** — needs a stage-transition/visibility concept that doesn't exist in the schema.

## New Brief — RESOLVED, Copy Options still scoped out of v1

**Built**: `components/project/NewBriefModal.tsx`, entry point on the project view (`+ New Brief`, staff-only via `useIsStaff`), against the prototype's `#briefScrim`/`openBriefModal`/`bwSave` (New Brief creates a creative; separately, `renderBrief`/`saveBrief` edit an existing one — the app's `BriefPanel.tsx` already corresponds to the latter). This is the first code path in the app that creates a `creatives` row — verified empirically before any UI was written (agency_id derives correctly from the `creatives_set_agency_id` trigger with none set in the payload, stage defaults to 1, a position computed from the project's current max lands where expected, and a real client-role session is rejected outright by RLS). Content Type/Format is a real cascade over `lib/formats.ts`'s catalog, storing the key. Scheduled/continuous fields are conditionally required client-side (Publish Date, Destination) with a field-level error before submit, so the schema's `check_creative_delivery_fields` trigger — confirmed by the same empirical pass to reject a missing `scheduled_at`/`destination` outright — is a backstop, not the first thing a user meets.

Below is the original audit this was built against. Ten of the thirteen fields the modal captures map onto columns or proven versioning patterns that already existed (`creatives.name/concept/reference_url/approach_notes/lead_user_id/scheduled_at/destination/due_on/format`, `copy_versions.slide_text`, `creatives.cx`). **Copy Options (`bwCopies`, "+ Add Option") did not**, and remains the one field that needs an actual decision, not a schema change derivable from what's there — New Brief ships with a single caption into `copy_versions.fields.caption` instead (via the same insert `useSaveSlideText`/`useSaveCopyFields` already use), and no "options" concept.

The prototype's own comment calls it out as distinct from Text on Image: both "create a copy version," but Copy Options is a *list of candidate captions* offered at brief time for a copywriter to draft from — not the final content of any one version. `copy_versions.fields` (jsonb: caption/headline/cta/subject_line/preview_text/alt_text) models the opposite shape: **one version's settled content**, confirmed by how `useSaveSlideText` already uses the table — every edit inserts a new row that carries the *existing* `fields` forward untouched, changing only what that edit was for. There's no column or table anywhere for "here are three options, pick one."

Open product questions this needs answered, not derived:

- **Do options persist after one is picked?** Does choosing a caption promote it into `copy_versions.fields.caption` and the rest simply vanish, or do all candidates stay on record against the creative/version?
- **Who chooses?** The brief-writer proposes them — does the copywriter pick, does a client ever see the options, or is picking itself a staff-only action regardless of who briefed it?
- **Are rejected options kept?** If they're discarded, "Copy Options" is really just brief-writer scratch space with no lasting data shape at all — closer to a text field than a first-class list. If they're kept, that's a real new column or table, and a decision about who can read it later (comment visibility's private/public split doesn't obviously apply, but it's the closest precedent in this schema).

Building Copy Options without answering these would have meant guessing at a data shape for a concept the prototype itself doesn't fully commit to — left for a later pass once the questions above have real answers.

## `format_directions` has no delete policy at all

Found while testing New Brief's format catalog (`lib/formats.ts`) against `Settings → Knowledge`: `format_directions` has `_select`/`_insert`/`_update` RLS policies (`supabase/seed.sql`) but no `_delete` policy whatsoever — not staff-only, not admin-only, just absent. Under RLS's default-deny model that means **nobody can remove a format direction through the app, staff or admin**, once one exists. Confirmed by reading the policy list, not assumed.

This doesn't look like a deliberate scoping decision — every other place in this schema that withholds a capability says so directly (e.g. `agency_settings`'s comment explicitly says "write is admin-only"; the memberships/clients tables spell out who can do what for every operation). `format_directions` has no such comment next to the missing delete policy, which reads more like an oversight than an intentional "deletion isn't a feature here" choice.

Whether it should be one: `AddFormatForm` now selects from a fixed 41-entry catalog rather than free text, which makes mis-adding an entry (wrong format, added twice by mistake) more likely to actually happen in practice, not less — the whole catalog is one click away in a dropdown. Not being able to remove one afterward, with no workaround short of a direct database edit, looks like a real gap rather than a boundary anyone decided on purpose. Recommend adding a delete policy (staff or admin-only, matching `_update`'s reach) as a small follow-up — not done here, since this pass's job was to note the gap, not decide it.

## `.review` grid — leaving the drift in place

The base `.review` rule is confirmed Drifted (see `docs/css-coverage.md`): the prototype is `grid-template-columns:0 minmax(0,1fr) 427px` with a `.22s` transition and two additional state classes, `.review.feedrailed` / `.review.withfeed`, that widen the first column to show an Instagram grid/feed-connection panel. The app's version is a plain two-column grid with no leading zero-width column, no transition, and no state classes.

Not restoring this: the leading column and its two states exist entirely to host the feed panel, which requires a platform-connections feature (OAuth to Instagram/Meta, storing and syncing feed data) that doesn't exist in this schema. Porting the grid mechanics without anything to put in that column would just be dead CSS. Left alone deliberately — see the inline comment at `.review` in `app/globals.css`.

## Shared-review preview toggle — RESOLVED

Was: the app switched phone/browser layout with a `min-width:900px` media query; the prototype uses a `.desk` class toggled by a `.pw-seg` **Phone / Desktop** segmented control (`data-sv="phone"` / `data-sv="desktop"`, prototype lines ~1922-1923, wired at ~5341-5344) — a manual override, not a responsive layout.

**Fixed on `/review/[token]` itself**, not as a separate agency-only overlay. Reading the prototype's actual markup (`#phoneWrap`, lines 1917-1938) and script (`openPhone()`/`#pwClose`/`#pwReset`, ~5075-5100 and ~5340-5346) first showed this control lives inside a `position:fixed;inset:0;z-index:200` overlay triggered from the Share modal's "Preview" button (`#shPreview`) — an agency-only QA view with "Start over" and "Back to the agency view" buttons and a link-metadata readout (`#pwState`: expiry, passcode, approve permission), all addressed to agency staff checking a link before sending it, not to the guest who opens it.

Building that exact overlay would mean a new trigger in `ShareModal.tsx`, a new full-screen modal layer, and duplicating the phone/desktop rendering already on the real public page — a bigger feature than "port the toggle mechanism." Instead, the toggle itself was added directly to the page a real guest already opens, since that page already renders both shapes and already needs something to decide which one shows. Two things deliberately left out because they don't apply to that page:

- **`#pwState`'s link-metadata readout** (expiry/passcode/approve-permission) — agency-relevant configuration, not something a guest needs told back to them about their own link, and only partially derivable from `useSharedReview`'s current response shape (`scope`, `can_approve` exist; expiry and passcode-required don't).
- **"Start over" / "Back to the agency view"** — reset a demo-only sign-in simulation and return to the authenticated app respectively. Neither concept exists for an unauthenticated guest.

**Behaviour change, disclosed, not silent**: the page now defaults to the prototype's own default (`shareView="phone"`) regardless of the visitor's actual device, replacing the previous responsive default. A real visitor on a desktop browser now sees the phone-shaped preview first and has to click "Desktop" — matching the prototype exactly, but a genuine change from what this page did before.

Spec coverage: `tests/e2e/shared-review-public.spec.ts`, one case per state (`shared-review-phone` at the default 1280px viewport, `shared-review-desktop` at 1600px — the browser frame plus `.pw-side` plus the gap between them overflows 1280px once both are on screen).

## Primary nav — three icons led to a dead 404 — RESOLVED

`NavRail.tsx`'s `NAV_ITEMS` used to link to `/calendar`, `/analytics` and `/visibility` unconditionally, for every signed-in user, all the time, none of those routes existing anywhere under `app/`. Checked empirically, not assumed from the route listing: signed in, clicked the Calendar icon from the dashboard, landed on a real `HTTP 404` — Next.js's bare, unstyled default 404 page, no `.rail`, no topbar, nothing. The app shell didn't wrap it because there was no matching route anywhere in the tree for the router to render a shell around; the user was dropped completely out of the product with no way back except the browser's back button.

**Fixed**: the three icons now render only inside a client context (`clientId` truthy, the same `/clients/[id]` path-match `Knowledge` already used), matching the prototype's own `syncRail()` — `show = client||inClient` gates Calendar/Analytics/Knowledge, `!client && inClient` gates Visibility. They're no longer reachable from the dashboard or anywhere else outside a client.

Two things deliberately not replicated, so a future pass doesn't mistake either for an oversight:

- **`syncRail()`'s `client` variable** (the agency/client *preview* toggle, `MODE==="client"` in the prototype — `previewMode` in `store/ui-store.ts` here, already real and wired to the topbar toggle) is not part of the fix's condition. In the prototype it's an OR: these icons also show in preview-as-client mode even without a selected client. This app's `previewMode` isn't tied to any specific client route, so honouring that OR would show the icons in more places (e.g. the dashboard, previewing as client, no client selected) with nothing to point them at — reintroducing dead-end surface rather than removing it. Only the `inClient` half was ported here. (Visibility's `!client` half — real *role*, not preview — is a separate fix; see "Settings and Visibility ignored client role" below.)
- **The underlying screens still don't exist.** This fix corrected *reachability* to match the prototype — the icons no longer appeared where they didn't work — but at the time didn't build Calendar, Analytics or Visibility, so clicking one from inside a client still 404'd. **Now also resolved**: each has a placeholder route (`app/(app)/calendar`, `app/(app)/analytics`, `app/(app)/visibility`) that renders inside the real app shell — rail, topbar, breadcrumb (`Topbar.tsx`'s `CRUMBS` map already had entries for all three, unused until now) — with the same `.empty` block pattern used elsewhere in the app for "nothing here yet" states, saying plainly that the screen isn't built. Still not the feature — this is a shell, not a calendar or a performance dashboard, same already-tracked gap as everything in `docs/css-coverage.md`'s deferred bucket — but a signed-in user clicking any of these three now never leaves the product.
- **Same narrower approximation of "inside a client" that `Knowledge` already has**: gated on the URL literally starting with `/clients/[id]`, not on "is this creative/project's client the one I'm in" — so the icons (like `Knowledge`) disappear again on `/projects/[id]` and `/creatives/[id]`, even though those pages belong to a client too. Extending that would need `NavRail` to know a project's or creative's `client_id`, which it doesn't fetch today; out of scope for this fix, consistent with the choice already made for `Knowledge`.

## Settings and Visibility ignored client role — RESOLVED

Found during a client-view audit, empirically: logged a real client-role session into the running app (not `previewMode` — an actual `memberships.client_id`-scoped user) and walked every built screen. `NavRail.tsx` rendered Settings unconditionally for every signed-in user, and rendered Visibility for anyone inside a `/clients/[id]` route regardless of role — both purely route-pattern gates, no permission check at all. None of the four `/settings/*` pages checked role either, so a client typing the URL directly got the real, populated agency-branding form and (until the fix below) a broken team page — full staff configuration surface, reachable and partly interactive.

The prototype's `syncRail()` treats both as real role boundaries, not reachability: `$("#navSet").style.display = client ? "none" : "grid"` hides Settings from client mode unconditionally, and `$("#navVis").style.display = (!client&&inClient)?"grid":"none"` shows Visibility only to staff — it's the screen where staff configure what a client is *allowed* to see, so showing it to the client themselves defeats the point.

**Fixed** with two layers, both keyed on real membership via a new `useIsStaff()` hook (`useMyAgency()` + `useMyMembership()`, the same pattern `CommentsPanel` already used — deliberately not `previewMode`, which doesn't restrict anything real):

- `NavRail.tsx` hides both Settings and Visibility unless `isStaff` (and hides them while that's still resolving — fails closed, never shows staff-only nav to a session not yet confirmed staff).
- `app/(app)/settings/layout.tsx` — the one layout wrapping all four `/settings/*` routes — redirects a non-staff session to `/dashboard` before rendering any tab content, so a direct URL is closed the same way the nav link already was. No dedicated "forbidden" page exists in this app yet, and a client landing on their own dashboard is a real, useful place to end up rather than a dead end.

Verified empirically both directions: a real client-role session sees neither nav item and gets redirected off every settings page (`tests/e2e/nav-rail.spec.ts`, `tests/e2e/settings.spec.ts`); a real staff session still sees and reaches all of it.

**Separately**, `/settings/team` turned out to be broken for *everyone*, staff included, independent of this fix — `hooks/use-team-members.ts`'s `user:users(name, email)` embed was ambiguous (`memberships` has two FKs to `users`: `user_id` and `invited_by`), which PostgREST rejects outright (`PGRST201`) regardless of caller or RLS. The team page silently landed on its generic "Couldn't load the team" state and nothing caught it, since no spec had ever asserted the roster's actual content. Fixed by disambiguating to `users!memberships_user_id_fkey(name, email)`; verified with both a staff and a client session directly against Supabase (both now resolve correctly — RLS itself was never the problem, PostgREST's embed selection was). Not a prototype-parity issue, but found by the same audit.

**Also found in the same audit and now fixed**: `CommentCard`'s Resolve/Reopen button was gated on `isStaff` alone, stricter than both the database and the prototype. Verified empirically, seeded through real authenticated sessions per `frank-conventions`: `comments_update_own`'s RLS policy (`author_id = auth.uid() or is_agency_staff(agency_id)`) lets a client resolve or reopen a thread *they authored*, and correctly blocks them from resolving anyone else's — authorship, not role. The prototype agrees; it only gates "Make Public/Private" behind `MODE==="client"`, never Resolve/Reopen. Changed the condition to `isStaff || thread.author_id === currentUserId`; the internal-toggle and Make Public/Private gates stayed on `isStaff`, since those really are staff-only at both layers. Spec coverage: `tests/e2e/comment-resolve.spec.ts`.

## Dashboard — three of four stat cards are permanently empty — RESOLVED

Was: `app/(app)/dashboard/page.tsx` rendered a single `.stat` child (Active Clients) inside `.stats`, which is CSS'd as a 4-column grid (`.stats{grid-template-columns:repeat(4,minmax(0,1fr))}`, matched against the prototype, untouched by the recent CSS pass). With one real child and three that didn't exist, the grid showed one populated cell and three blank grey ones — not zeros, not placeholders, just empty grid tracks. The prototype's other three (Live Projects, Waiting on Approval, Feedback to Action) all needed cross-table aggregation queries that were never built.

**Fixed**: `hooks/use-agency-creative-stats.ts` runs the prototype's `clientStats`-equivalent aggregation — one `projects` count plus one `creatives(stage, exception)` select, banded client-side with the same `bandOf()` step 1 built — and the three remaining cards are wired to it, `.n.flag` applied to Waiting on Approval / Feedback to Action exactly as the prototype does. No `agency_id` filter added client-side; both queries rely entirely on RLS, verified empirically against a two-agency fixture before wiring (`scripts/check-agency-creative-stats-scoping.mjs`, kept as a permanent check, not a one-off).

**Loading state, not in the prototype to match**: the prototype has no async data, so it has no equivalent of a stats query still in flight. Rather than inventing a real skeleton/shimmer treatment not established anywhere else in this codebase, an unresolved card shows `…` in place of the number — same shape as this page's own `"Loading your clients…"` text, and deliberately not `0`, since a zero here reads as "confirmed empty" rather than "not loaded yet" (the same failure shape as the `isStaff` loading-flash bug in `app/(app)/creatives/[id]/page.tsx`). Uses `isPending`, not `isLoading`, since the query stays disabled (and therefore not "loading") until `useMyAgency()` resolves an `agencyId` — `isLoading` alone would flash past that wait straight to the empty-but-"done" look.

Spec coverage: `tests/e2e/dashboard.spec.ts`, both the re-baselined screenshot and a dedicated case asserting the four numbers against the fixture's known seed data (1 project, 1 stage-5/review creative → `1`/`1`/`1`/`0`).

## Client workspace and project table — both much thinner than the prototype

Two related, previously-verbal-only findings, formalized here:

- **`/clients/[id]`** (`ClientWorkspacePage`) renders a client's name and a flat list of its projects — no stats strip, no progress bars, no per-project deadline column. The prototype's equivalent client workspace has all of that. — **Project row half RESOLVED, see below.**
- **`/projects/[id]`** (`ProjectPage`) renders a simplified flat `.ptable` — see the note moved from `app/globals.css` below — where the prototype's is the full resizable, reorderable, custom-column calendar/table grid (`.tbl`, drag-and-drop columns, sticky headers, the whole system audited separately under "calendar" in `docs/css-coverage.md`'s deferred bucket). Still open.

Neither is a CSS problem — the classes that exist are correctly styled and matched against the prototype. Both are feature-completeness gaps: the richer prototype views need real queries, real aggregation, and in the project table's case a substantial column-management feature, not a stylesheet change.

### Client workspace project rows — RESOLVED

Was: creative count, approval progress and status columns all rendered `—`, and the row's only real content in that half was a `<span class="tag blue">Scheduled/Continuous</span>` standing in for delivery mode — a placeholder pattern, not the prototype's `renderProjects()`.

**Fixed**: `hooks/use-project-creative-stats.ts` (per-project `bandOf()` aggregation, same shape as the dashboard's hook) now drives the creative count (`${total} total`), the approval bar (`.bar`/`.bar i`/`.barlbl`, ported from the prototype, width `Math.round(done/total*100)%`), and the status tag — `grey` "Not started" / `amber` "`N` with the client" (or "need your review" in client-preview mode, reading `store/ui-store.ts`'s existing `previewMode` the same way the prototype reads `MODE==="client"`) / `green` "All approved" / `blue` "In production", with `pending = waitingOnApproval + feedbackToAction` combined into one count exactly as the prototype's `projStats().pend` is — deliberately not split into two tag states the way the dashboard's cards are.

**Delivery mode relocated, not deleted**: the prototype puts `KBADGE(p.kind)` in the row's `.sub` line under the project name, alongside the project's `type` text — ported as `components/project/KBadge.tsx` plus `.kbadge`/`.cname .t .sub` CSS, both copied verbatim from the prototype. This also resolved a head-row mismatch: the app had grown an extra "Type" column (`Project`/`Type`/`Creatives`/`Mode`/`Due`) not present in the prototype's actual head row (`Project`/`Creatives`/`Approval Progress`/`Status`/`Deadline`) — `.crow`'s grid-template-columns (`1fr 96px 150px 128px 92px 70px`) already matched the prototype's 5-data-column-plus-actions shape, so the extra column was always being squeezed into tracks sized for something else. Removed; project type now reads from the `.sub` line instead of its own column.

Loading state follows the same `isPending`-driven `…` placeholder as the dashboard's cards, for the same reason (`useProjectCreativeStats` returning no data yet reads as legitimately unresolved, not as a confirmed zero).

Spec coverage: `tests/e2e/client-workspace.spec.ts`, re-baselined screenshot plus a dedicated case asserting the badge, count, bar label and status tag text against the fixture's known seed data.

### `.ptable` — moved here from `app/globals.css`

The following comment sat directly above `.ptable` in `app/globals.css` since Phase 2; moved here because a rationale for *not* matching the prototype belongs in the parity-gaps record, not scattered across the stylesheet as a standalone comment. A one-line pointer is left in its place.

> Project view — dual-mode creative table. No prototype equivalent exists for a plain flat list (the prototype's table is the full resizable, reorderable, custom-column grid — a later phase); this is a simplified stand-in built from the same tokens.

## Comment card — missing the `.intag` "Private" badge

The prototype marks an internal comment two ways: `.cmt.internal`'s border colour (which the app has, restored this session) and a distinct `.intag` badge — an uppercase, pink, icon-plus-label pill (`<div class="intag"><svg>…lock…</svg>Private</div>`, prototype line ~3797) rendered inside the card itself. The app has no `.intag` CSS at all and never renders that badge; instead `CommentCard` shows a generic `<span className="tag grey">Private</span>`, a different, older, more generic pattern used elsewhere in the app for other pills.

Not caused by the recent CSS pass — `.intag` wasn't touched by any of the nine stylesheet commits, only `.cmt.internal` and `.intog` were. Worth noting the app's `.tag.grey` and the prototype's `.intag` are two different visual treatments for the same concept; picking one is a design decision, not a mechanical port, since the app's version already ships and changing it changes what every existing internal comment looks like.
