---
name: prototype-parity
description: Working method for porting a screen or CSS rule from the static prototype (project-details/frank-prototype.html) to the live Next.js app without drift. Load before touching globals.css or building/verifying any authenticated screen.
---

# Prototype parity — working method

Every authenticated screen in Frank is meant to be a faithful port of
`project-details/frank-prototype.html`. Drift between the two is invisible
until the live app is actually screenshotted with a real session — it does
not show up in `npm run build`, in a type-check, or in reading the React
code in isolation. This skill is how to stop introducing it, and how to find
it where it already exists.

**The prototype is read-only. Never edit it.** It is the specification, not
a scratchpad — if something in it looks wrong, that's a question for the
human, not something to "fix" in place.

## Where the prototype is, and its shape

`project-details/frank-prototype.html`, roughly 7,400 lines, three parts.
Re-verify these line numbers with grep before relying on them — the file
may have moved since this was written, and a stale line number cited
confidently is worse than no line number.

1. **The `<style>` block**, roughly lines 10-1512. Design tokens on
   `:root`, then around 800 class names. This is the design system.
   `body.comfortable` redefines the density tokens (a real, live state — the
   density toggle in Settings). `body.lightrail` is a complete alternate
   theme for the rail and topbar (also a real, live state). Both need to be
   ported as whole blocks, not cherry-picked.
2. **The markup**, roughly lines 1513-2317. `.app` shell, `.topbar`, eight
   `.view` sections (dashboard, review, projects, knowledge, calendar,
   analytics, visibility, settings), then ~20 modal `.scrim` blocks.
3. **The script**, roughly lines 2318-7389. The render functions
   (`renderClients`, `renderProjects`, `renderCal`, `renderKb`, `renderSet`,
   `renderCrumb`, `go`/`setMode`/`syncRail`, etc.) are as much a part of the
   spec as the CSS — they define the DOM the CSS is written against. Read a
   render function alongside its markup, never the markup alone; the CSS
   selects on structure the render function produces dynamically (rows,
   states, conditionally-shown elements) that the static markup doesn't show.

Structural constraints that are easy to lose in a React port, because
nothing looks wrong until the specific case comes up:

- `body{overflow:hidden}`, `.app{display:grid;grid-template-columns:84px
  1fr;height:100vh}`. The page itself never scrolls; individual panes
  (`.view`, `.pane-b`, `.cmts-b`, etc.) do. A component that lets the outer
  page scroll instead of its own pane is not a faithful port even if it
  looks right at one viewport height.
- Typography: Inter with `letter-spacing:-.006em`,
  `font-feature-settings:"cv05","ss01"`, `font-variant-numeric:tabular-nums`.
  If `next/font` loads Inter without all three, numbers and certain glyphs
  will not match, and no layout fix closes that gap — it has to be fixed at
  the font declaration.
- Interactive state lives in ARIA attributes, not ad-hoc classes:
  `aria-pressed`, `aria-current`, `aria-selected`. The CSS selects on
  `[aria-pressed="true"]` etc. This is exactly the shape of the
  `.modeswitch` and `.tool[aria-pressed="true"]` bugs: correct ARIA wiring
  in the JSX, with no matching CSS selector, so the state changes with zero
  visual feedback. When porting a screen, explicitly check every
  ARIA-driven selector in the relevant CSS section against the JSX — don't
  assume "the attribute is set correctly" means "the state is styled."

## The method, per screen or per CSS section

1. **Read the prototype markup and its render function together**, for the
   specific screen or component in scope. Not a skim — element for element.
2. **Write down the DOM you intend to produce** (in a scratch note or the
   commit message) and check it against the prototype's, element for
   element, before writing a single line of CSS or JSX. Most drift starts
   here: an extra wrapper div, a missing one, a class on the wrong element.
3. **Extract CSS, don't retype it.** Pull the exact declaration block from
   the prototype with a grep/read, then paste and adapt — don't reproduce it
   from memory or from what "looks about right." Retyping is how `40px`
   becomes `40rem`, how a density token gets rounded, how a hex value drifts
   by one digit. If a value needs to change (e.g. because of the platform
   this app doesn't have but the prototype fakes), that's a
   `docs/parity-gaps.md` entry, not a silent tweak.
4. **Style using what already exists after the CSS coverage pass** — tokens
   and shared classes (`.btn`, `.field`, `.tag`, `.modal`, etc.) already
   ported. Don't invent a parallel one-off class for something the
   prototype already names.
5. **Verify in all four states the prototype actually supports**: agency
   mode and client mode, compact density and comfortable density. A screen
   that's correct in one combination and wrong in another is not done — this
   is exactly how `.modeswitch` and `body.lightrail`-style gaps survive
   silently, because the default view (agency, compact) is the only one
   anyone looks at casually.
6. **Screenshot the real, authenticated app and compare against the
   prototype directly** — not from memory of what the prototype looks like.
   The `.modeswitch` bug and the `.tool[aria-pressed]` bug were both found
   only once a real session was actually screenshotted; reading the CSS and
   the JSX separately, correctly, in isolation, missed both. Use the
   Playwright visual-QA setup (`tests/e2e/` post-Phase-4, or
   `visual-qa.spec.ts` before) for this rather than eyeballing dev-server
   screenshots ad hoc — it's what makes the check repeatable instead of
   incidental.

## When parity would require inventing schema

Stop. Do not approximate. Write an entry into `docs/parity-gaps.md` with:
the screen, what the prototype does, and what the schema would need to
support it for real. Precedent for exactly this kind of gap: the "Which
Creative" selector, Content Type and Format selects, the AI vision-caption
field, the WIIFM Note input, and the dual "Save as Coming Soon" / "Send for
Review" footer buttons on the Upload/Edit modal were all scoped out this
way rather than faked. Do not quietly un-scope any of them without a new,
explicit decision to do so — their absence is intentional, not an oversight
to "helpfully" fix.

## Reporting

At the end of any parity work: what changed, what was deliberately left
alone and why, anything newly added to `docs/parity-gaps.md`, and anything
in the prototype that couldn't be interpreted with confidence. Flag guesses
as guesses — a wrong guess presented as fact is more expensive to unwind
later than an open question.
