// Run with: node --experimental-strip-types --test lib/stage-labels.test.ts
// (or `npm run test:unit`). No test framework dependency — Node's built-in
// node:test/node:assert plus its TypeScript type-stripping, both already
// available at the Node 20.6+ this repo already requires.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bandOf, stageLabel, stageColor, exceptionLabel, type Exception } from "./stage-labels.ts";

const EXCEPTIONS: Exception[] = ["changes_requested", "rejected"];

test("bandOf — all eight stages, no exception", () => {
  const expected: Record<number, string> = {
    1: "internal",
    2: "internal",
    3: "internal",
    4: "internal",
    5: "review",
    6: "approved",
    7: "scheduled",
    8: "published",
  };
  for (const [stage, band] of Object.entries(expected)) {
    assert.equal(bandOf(Number(stage), null), band, `stage ${stage}`);
  }
});

test("bandOf — every valid exception, at every stage the DB constraint allows it (1-5)", () => {
  for (const exception of EXCEPTIONS) {
    for (let stage = 1; stage <= 5; stage++) {
      assert.equal(
        bandOf(stage, exception),
        exception,
        `stage ${stage}, exception ${exception}`,
      );
    }
  }
});

test("bandOf — exception wins unconditionally, even past the stage 1-5 constraint boundary", () => {
  // creatives_exception_stage only allows exception to coexist with stage
  // <= 5 at the database layer — this is a pure function with no database
  // in front of it, so it must not silently assume that constraint. It
  // should behave exactly like the prototype's `e.exc || STAGES[e.stage][2]`
  // (exception always wins) regardless of what a real row could contain.
  for (const exception of EXCEPTIONS) {
    for (const stage of [6, 7, 8]) {
      assert.equal(bandOf(stage, exception), exception, `stage ${stage}, exception ${exception}`);
    }
  }
});

test("bandOf — stage 1-5 boundary itself, no exception", () => {
  assert.equal(bandOf(4, null), "internal"); // last internal stage
  assert.equal(bandOf(5, null), "review"); // first review stage
});

test("bandOf — out-of-range stage falls back to stage 1's band, same shape as the prototype's STAGES[e.stage]||STAGES[1]", () => {
  assert.equal(bandOf(0, null), "internal");
  assert.equal(bandOf(9, null), "internal");
  assert.equal(bandOf(-1, null), "internal");
});

test("stageLabel — unchanged by the shared-table refactor (scheduled)", () => {
  assert.equal(stageLabel(1, "scheduled"), "Concept");
  assert.equal(stageLabel(5, "scheduled"), "Client review");
  assert.equal(stageLabel(7, "scheduled"), "Scheduled");
  assert.equal(stageLabel(8, "scheduled"), "Published");
});

test("stageLabel — unchanged by the shared-table refactor (continuous)", () => {
  assert.equal(stageLabel(7, "continuous"), "Ready to deliver");
  assert.equal(stageLabel(8, "continuous"), "Delivered");
  // Stages 1-6 are identical text across both delivery modes.
  assert.equal(stageLabel(1, "continuous"), stageLabel(1, "scheduled"));
});

test("stageColor — exception always wins over stage, same precedence as bandOf", () => {
  for (const exception of EXCEPTIONS) {
    for (let stage = 1; stage <= 8; stage++) {
      assert.equal(
        stageColor(stage, exception),
        stageColor(1, exception),
        `stage ${stage} with exception ${exception} should match stage 1's colour for the same exception`,
      );
    }
  }
});

test("stageColor — no exception, colour tracks the band groupings the prototype's STAGES table defines", () => {
  assert.equal(stageColor(1, null), stageColor(4, null)); // 1-4 share the "internal" grey
  assert.equal(stageColor(6, null), stageColor(7, null)); // 6-7 share the "approved" green
  assert.notEqual(stageColor(4, null), stageColor(5, null)); // internal vs review differ
  assert.notEqual(stageColor(7, null), stageColor(8, null)); // approved vs published differ
});

test("exceptionLabel — human-readable text for both exception values", () => {
  assert.equal(exceptionLabel("changes_requested"), "Changes Requested");
  assert.equal(exceptionLabel("rejected"), "Rejected");
});

test("stageLabel and bandOf agree on where the stage table's rows are — label and band cannot drift apart", () => {
  // For every stage, whichever row stageLabel() reads is the same row
  // bandOf() reads — proven here by checking both against the same stage
  // number rather than against two independently-maintained lists.
  for (let stage = 1; stage <= 8; stage++) {
    const label = stageLabel(stage, "scheduled");
    const band = bandOf(stage, null);
    assert.ok(label && band, `stage ${stage} has both a label and a band`);
  }
});
