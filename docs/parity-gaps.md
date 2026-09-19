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
