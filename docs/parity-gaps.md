# Parity gaps

Screens or controls where the prototype does something the live app doesn't, and closing the gap needs more than a CSS/DOM fix — a schema change, a new feature, or a decision this pass isn't positioned to make on its own. See the `prototype-parity` skill for the escalation rule this file exists to serve.

## Upload/Edit modal (established prior to this file's creation)

Scoped out on the grounds that each would require a schema or feature decision, not a styling one:

- **"Which Creative" selector** — the app's modal is always invoked from one specific creative already; the prototype's selector exists because its modal can be opened generically.
- **Content Type / Format selects** — editable in the prototype; changing a creative's format after creation isn't a decision this pass can make.
- **AI vision-caption field** ("What the Artwork Looks Like") — unbuilt AI feature.
- **WIIFM Note input** — would duplicate or conflict with the Brief panel's existing `approach_notes` field; a data-modeling decision.
- **Dual "Save as Coming Soon" / "Send for Review" footer buttons** — needs a stage-transition/visibility concept that doesn't exist in the schema.

## `.review` grid — leaving the drift in place

The base `.review` rule is confirmed Drifted (see `docs/css-coverage.md`): the prototype is `grid-template-columns:0 minmax(0,1fr) 427px` with a `.22s` transition and two additional state classes, `.review.feedrailed` / `.review.withfeed`, that widen the first column to show an Instagram grid/feed-connection panel. The app's version is a plain two-column grid with no leading zero-width column, no transition, and no state classes.

Not restoring this: the leading column and its two states exist entirely to host the feed panel, which requires a platform-connections feature (OAuth to Instagram/Meta, storing and syncing feed data) that doesn't exist in this schema. Porting the grid mechanics without anything to put in that column would just be dead CSS. Left alone deliberately — see the inline comment at `.review` in `app/globals.css`.

## Shared-review preview toggle — missing entirely, not just drifted

The prototype's `.phonewrap`/`.browser`/`.phone` were flagged as Drifted in the CSS audit (the app switches phone/browser layout with a `min-width:900px` media query; the prototype uses a `.desk` class toggled by JS). Digging into *why* the prototype does it that way changes the classification: `.phonewrap` is a full-screen overlay (`position:fixed;inset:0;z-index:200`) with its own `.pw-seg` **Phone / Desktop toggle buttons** (`data-sv="phone"` / `data-sv="desktop"`, prototype lines ~1922-1923, wired at ~5341-5344) that let an agency user viewing a share-preview force either layout regardless of their actual viewport — a manual QA/preview control, not a responsive layout.

The app has no equivalent: no full-screen preview overlay, no manual phone/desktop toggle, nothing that lets an agency user check "what will this look like on a phone" from their own desktop browser before sending a share link. The `min-width:900px` media query only ever shows what the *viewer's own* device would naturally get — it can't be forced either way.

This is a missing feature (an overlay component, two buttons, and the state to drive them), not a value to restore in a CSS pass. Not built here. If picked up later: it would live wherever the Share modal's "preview" action is triggered from (`ShareModal.tsx` doesn't currently have one), needs no new schema (it's pure client-side view state), and should reuse the existing `.phonewrap`/`.pw-seg`/`.browser`/`.phone` CSS once ported rather than inventing new classes.

## Primary nav — three icons led to a dead 404 — RESOLVED

`NavRail.tsx`'s `NAV_ITEMS` used to link to `/calendar`, `/analytics` and `/visibility` unconditionally, for every signed-in user, all the time, none of those routes existing anywhere under `app/`. Checked empirically, not assumed from the route listing: signed in, clicked the Calendar icon from the dashboard, landed on a real `HTTP 404` — Next.js's bare, unstyled default 404 page, no `.rail`, no topbar, nothing. The app shell didn't wrap it because there was no matching route anywhere in the tree for the router to render a shell around; the user was dropped completely out of the product with no way back except the browser's back button.

**Fixed**: the three icons now render only inside a client context (`clientId` truthy, the same `/clients/[id]` path-match `Knowledge` already used), matching the prototype's own `syncRail()` — `show = client||inClient` gates Calendar/Analytics/Knowledge, `!client && inClient` gates Visibility. They're no longer reachable from the dashboard or anywhere else outside a client.

Two things deliberately not replicated, so a future pass doesn't mistake either for an oversight:

- **`syncRail()`'s `client` variable** (the agency/client *preview* toggle, `MODE==="client"` in the prototype — `previewMode` in `store/ui-store.ts` here, already real and wired to the topbar toggle) is not part of the fix's condition. In the prototype it's an OR: these icons also show in preview-as-client mode even without a selected client. This app's `previewMode` isn't tied to any specific client route, so honouring that OR would show the icons in more places (e.g. the dashboard, previewing as client, no client selected) with nothing to point them at — reintroducing dead-end surface rather than removing it. Only the `inClient` half was ported.
- **The underlying screens still don't exist.** This fix corrects *reachability* to match the prototype — the icons no longer appear where they didn't work. It does not build Calendar, Analytics or Visibility. Clicking one of them from inside a client will still 404; that's the same already-tracked "screen not built yet" gap as everything else in `docs/css-coverage.md`'s deferred bucket, not a navigation defect anymore.
- **Same narrower approximation of "inside a client" that `Knowledge` already has**: gated on the URL literally starting with `/clients/[id]`, not on "is this creative/project's client the one I'm in" — so the icons (like `Knowledge`) disappear again on `/projects/[id]` and `/creatives/[id]`, even though those pages belong to a client too. Extending that would need `NavRail` to know a project's or creative's `client_id`, which it doesn't fetch today; out of scope for this fix, consistent with the choice already made for `Knowledge`.

## Dashboard — three of four stat cards are permanently empty

`app/(app)/dashboard/page.tsx` renders a single `.stat` child (Active Clients) inside `.stats`, which is CSS'd as a 4-column grid (`.stats{grid-template-columns:repeat(4,minmax(0,1fr))}`, matched against the prototype, untouched by the recent CSS pass). With one real child and three that don't exist, the grid shows one populated cell and three blank grey ones — not zeros, not placeholders, just empty grid tracks. The prototype's other three (Live Projects, Waiting on Approval, Feedback to Action) all need cross-table aggregation queries that were never built. Pre-existing; not something the nine stylesheet commits touched or could fix.

## Client workspace and project table — both much thinner than the prototype

Two related, previously-verbal-only findings, formalized here:

- **`/clients/[id]`** (`ClientWorkspacePage`) renders a client's name and a flat list of its projects — no stats strip, no progress bars, no per-project deadline column. The prototype's equivalent client workspace has all of that.
- **`/projects/[id]`** (`ProjectPage`) renders a simplified flat `.ptable` — see the note moved from `app/globals.css` below — where the prototype's is the full resizable, reorderable, custom-column calendar/table grid (`.tbl`, drag-and-drop columns, sticky headers, the whole system audited separately under "calendar" in `docs/css-coverage.md`'s deferred bucket).

Neither is a CSS problem — the classes that exist are correctly styled and matched against the prototype. Both are feature-completeness gaps: the richer prototype views need real queries, real aggregation, and in the project table's case a substantial column-management feature, not a stylesheet change.

### `.ptable` — moved here from `app/globals.css`

The following comment sat directly above `.ptable` in `app/globals.css` since Phase 2; moved here because a rationale for *not* matching the prototype belongs in the parity-gaps record, not scattered across the stylesheet as a standalone comment. A one-line pointer is left in its place.

> Project view — dual-mode creative table. No prototype equivalent exists for a plain flat list (the prototype's table is the full resizable, reorderable, custom-column grid — a later phase); this is a simplified stand-in built from the same tokens.

## Comment card — missing the `.intag` "Private" badge

The prototype marks an internal comment two ways: `.cmt.internal`'s border colour (which the app has, restored this session) and a distinct `.intag` badge — an uppercase, pink, icon-plus-label pill (`<div class="intag"><svg>…lock…</svg>Private</div>`, prototype line ~3797) rendered inside the card itself. The app has no `.intag` CSS at all and never renders that badge; instead `CommentCard` shows a generic `<span className="tag grey">Private</span>`, a different, older, more generic pattern used elsewhere in the app for other pills.

Not caused by the recent CSS pass — `.intag` wasn't touched by any of the nine stylesheet commits, only `.cmt.internal` and `.intog` were. Worth noting the app's `.tag.grey` and the prototype's `.intag` are two different visual treatments for the same concept; picking one is a design decision, not a mechanical port, since the app's version already ships and changing it changes what every existing internal comment looks like.
