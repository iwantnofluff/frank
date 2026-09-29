// Run with: node --experimental-strip-types --test lib/viewport-fit.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFit } from "./viewport-fit.ts";

const VW = 1280;
const VH = 800;
const anchorAt = (left: number, top: number, w = 100, h = 20) => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

test("below — fits under the trigger, left-aligned", () => {
  const r = computeFit({ width: 200, height: 150, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(100, 100), placement: { side: "below" } });
  assert.deepEqual(r, { left: 100, top: 126, maxHeight: null });
});

test("below — end-aligned sits flush with the trigger's right edge", () => {
  const r = computeFit({ width: 200, height: 150, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(500, 100), placement: { side: "below", align: "end" } });
  assert.equal(r.left, 400);
});

test("below — flips above the trigger near the bottom of the screen", () => {
  const r = computeFit({ width: 200, height: 300, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(100, 700), placement: { side: "below" } });
  assert.equal(r.top, 700 - 6 - 300);
  assert.equal(r.maxHeight, null);
});

test("below — too tall for either side: takes the roomier side and scrolls", () => {
  const r = computeFit({ width: 200, height: 900, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(100, 100), placement: { side: "below" } });
  assert.equal(r.top, 126);
  assert.equal(r.maxHeight, VH - 120 - 6 - 8);
});

test("below — never runs off the right edge", () => {
  const r = computeFit({ width: 300, height: 100, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(1200, 100, 60), placement: { side: "below" } });
  assert.equal(r.left, VW - 300 - 8);
});

test("below — never runs off the left edge", () => {
  const r = computeFit({ width: 330, height: 100, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(10, 100, 60), placement: { side: "below", align: "end" } });
  assert.equal(r.left, 8);
});

test("beside — right of the trigger when there's room", () => {
  const r = computeFit({ width: 306, height: 400, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(100, 200), placement: { side: "beside" } });
  assert.deepEqual(r, { left: 210, top: 190, maxHeight: null });
});

test("beside — flips to the left near the right edge", () => {
  const r = computeFit({ width: 306, height: 400, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(1000, 200), placement: { side: "beside" } });
  assert.equal(r.left, 1000 - 10 - 306);
});

test("beside — slides up to stay fully on-screen near the bottom (the reported bug)", () => {
  const r = computeFit({ width: 306, height: 460, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(700, 700), placement: { side: "beside" } });
  assert.equal(r.top, VH - 460 - 8);
  assert.ok(r.top + 460 <= VH - 8);
});

test("beside — taller than the whole screen: pinned to the top and scrolls", () => {
  const r = computeFit({ width: 306, height: 1200, viewportWidth: VW, viewportHeight: VH, anchor: anchorAt(100, 300), placement: { side: "beside" } });
  assert.equal(r.top, 8);
  assert.equal(r.maxHeight, VH - 16);
});
