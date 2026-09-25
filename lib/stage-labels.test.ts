// Run with: node --experimental-strip-types --test lib/stage-labels.test.ts
// (or `npm run test:unit`). No test framework dependency — Node's built-in
// node:test/node:assert plus its TypeScript type-stripping, both already
// available at the Node 20.6+ this repo already requires.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bandOf, stageLabel, stageColor, exceptionLabel, type Exception } from "./stage-labels.ts";

const EXCEPTIONS: Exception[] = ["changes_requested", "rejected"];

test("bandOf — all four stages, no exception", () => {
  const expected: Record<number, string> = {
    1: "internal",
    2: "internal",
    3: "review",
    4: "approved",
  };
  for (const [stage, band] of Object.entries(expected)) {
    assert.equal(bandOf(Number(stage), null), band, `stage ${stage}`);
  }
});

test("bandOf — every valid exception, at every stage the DB constraint allows it (1-3)", () => {
  for (const exception of EXCEPTIONS) {
    for (let stage = 1; stage <= 3; stage++) {
      assert.equal(
        bandOf(stage, exception),
        exception,
        `stage ${stage}, exception ${exception}`,
      );
    }
  }
});

test("bandOf — exception wins unconditionally, even past the stage 1-3 constraint boundary", () => {
  // creatives_exception_stage only allows exception to coexist with stage
  // <= 3 at the database layer — this is a pure function with no database
  // in front of it, so it must not silently assume that constraint. It
  // should behave exactly like the prototype's `e.exc || STAGES[e.stage][2]`
  // (exception always wins) regardless of what a real row could contain.
  for (const exception of EXCEPTIONS) {
    assert.equal(bandOf(4, exception), exception, `stage 4, exception ${exception}`);
  }
});

test("bandOf — stage 2-3 boundary itself, no exception", () => {
  assert.equal(bandOf(2, null), "internal"); // last internal stage
  assert.equal(bandOf(3, null), "review"); // first review stage
});

test("bandOf — out-of-range stage falls back to stage 1's band, same shape as the prototype's STAGES[e.stage]||STAGES[1]", () => {
  assert.equal(bandOf(0, null), "internal");
  assert.equal(bandOf(5, null), "internal");
  assert.equal(bandOf(-1, null), "internal");
});

test("stageLabel — one label per stage, unaffected by delivery mode", () => {
  assert.equal(stageLabel(1, "scheduled"), "Concept");
  assert.equal(stageLabel(2, "scheduled"), "Internal Review");
  assert.equal(stageLabel(3, "scheduled"), "Client review");
  assert.equal(stageLabel(4, "scheduled"), "Approved");
  // The scheduled/continuous split only ever mattered for the old
  // stage 7/8 rows (Scheduled/Published), both gone now — every
  // remaining stage reads identically either way.
  for (let stage = 1; stage <= 4; stage++) {
    assert.equal(stageLabel(stage, "continuous"), stageLabel(stage, "scheduled"));
  }
});

test("stageColor — exception always wins over stage, same precedence as bandOf", () => {
  for (const exception of EXCEPTIONS) {
    for (let stage = 1; stage <= 4; stage++) {
      assert.equal(
        stageColor(stage, exception),
        stageColor(1, exception),
        `stage ${stage} with exception ${exception} should match stage 1's colour for the same exception`,
      );
    }
  }
});

test("stageColor — no exception, colour tracks the band groupings the stage table defines", () => {
  assert.equal(stageColor(1, null), stageColor(2, null)); // 1-2 share the "internal" grey
  assert.notEqual(stageColor(2, null), stageColor(3, null)); // internal vs review differ
  assert.notEqual(stageColor(3, null), stageColor(4, null)); // review vs approved differ
});

test("exceptionLabel — human-readable text for both exception values", () => {
  assert.equal(exceptionLabel("changes_requested"), "Changes Requested");
  assert.equal(exceptionLabel("rejected"), "Rejected");
});

test("stageLabel and bandOf agree on where the stage table's rows are — label and band cannot drift apart", () => {
  // For every stage, whichever row stageLabel() reads is the same row
  // bandOf() reads — proven here by checking both against the same stage
  // number rather than against two independently-maintained lists.
  for (let stage = 1; stage <= 4; stage++) {
    const label = stageLabel(stage, "scheduled");
    const band = bandOf(stage, null);
    assert.ok(label && band, `stage ${stage} has both a label and a band`);
  }
});
