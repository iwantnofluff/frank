@AGENTS.md

# Working in this repo with Claude Code

Everything in `AGENTS.md` applies. These are the Claude-specific ways of working on top of it.

## Before starting

- Load the `frank-conventions` skill before writing any code, and `prototype-parity` before touching `app/globals.css` or any authenticated screen.
- For anything larger than a small fix, plan first and get the user's go-ahead before editing.

## Running and checking the app

- The dev server is normally already running at `http://localhost:3000`. Check with `curl` before starting another one, and never kill it.
- Check every change in the real app, not just the tests. Write a throwaway Playwright spec at `tests/e2e/_tmp-*.spec.ts` using the `frank` fixture, save screenshots to the scratchpad, look at them, then delete the spec and the screenshots.
- When checking motion or anything time-based, measure with real timing — Playwright's screenshot default switches animations off.

## Tests

- Run the full Playwright suite in the background (it takes 3–4 minutes) and wait for it to finish rather than polling.
- A new table that tests can write to must be added to the teardown sweep in `tests/e2e/fixtures.ts`, in foreign-key order. After a failed teardown, check for and remove orphaned `E2E Test Agency` rows.
- Before regenerating any screenshot baseline, open its diff and confirm the change is intended. `dashboard.png` changes whenever the date rolls over (Last Activity column) — that is expected, not a regression.
- Never assert on a live AI response in a permanent test. Seed the result directly, and check real AI output by hand in a throwaway spec.

## AI features

- Every call to an AI model goes through `runAiTask` in `lib/ai/run-ai-task.ts`, so the agency's monthly cap and usage logging apply. Never call a provider directly.

## Wrapping up a piece of work

- Add an entry to `docs/parity-gaps.md` in the established style: what changed and why, then a "**Verified**:" paragraph with what was actually checked.
- Never commit or push unless the user asks. End the summary by saying whether anything is committed.
- Summaries lead with the outcome in plain language. Explain decisions and trade-offs, not code.
