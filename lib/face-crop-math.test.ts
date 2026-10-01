// Run with: node --experimental-strip-types --test lib/face-crop-math.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampCrop, initialCrop, pickFace, resizeCrop, HEAD_SCALE } from "./face-crop-math.ts";

test("no face: the largest centred square", () => {
  assert.deepEqual(initialCrop(1200, 800, null), { size: 800, x: 200, y: 0 });
  assert.deepEqual(initialCrop(600, 900, null), { size: 600, x: 0, y: 150 });
});

test("a face in the middle: a head-sized square centred on it, lifted for hair", () => {
  const c = initialCrop(2000, 2000, { x: 900, y: 900, width: 200, height: 200 });
  assert.equal(c.size, 200 * HEAD_SCALE);
  assert.equal(c.x + c.size / 2, 1000); // centred horizontally on the face
  assert.ok(c.y + c.size / 2 < 1000); // lifted above the face's centre
});

test("a face near the edge: the square stays inside the photo", () => {
  const c = initialCrop(1000, 1000, { x: 0, y: 0, width: 150, height: 150 });
  assert.equal(c.x, 0);
  assert.equal(c.y, 0);
  const far = initialCrop(1000, 1000, { x: 880, y: 880, width: 120, height: 120 });
  assert.equal(far.x + far.size, 1000);
  assert.equal(far.y + far.size, 1000);
});

test("a face filling the frame: capped at the photo's shorter side", () => {
  const c = initialCrop(800, 600, { x: 100, y: 50, width: 500, height: 500 });
  assert.equal(c.size, 600);
  assert.equal(c.y, 0);
});

test("clamping keeps any crop inside the photo", () => {
  assert.deepEqual(clampCrop({ x: -50, y: 900, size: 300 }, 1000, 1000), { x: 0, y: 700, size: 300 });
});

test("zooming keeps the same centre", () => {
  const c = resizeCrop({ x: 400, y: 400, size: 200 }, 100, 1000, 1000);
  assert.deepEqual(c, { x: 450, y: 450, size: 100 });
});

test("several faces: the biggest is the subject", () => {
  const small = { x: 0, y: 0, width: 50, height: 50 };
  const big = { x: 500, y: 500, width: 200, height: 220 };
  assert.equal(pickFace([small, big]), big);
  assert.equal(pickFace([]), null);
});
