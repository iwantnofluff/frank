import { test } from "node:test";
import assert from "node:assert/strict";
import { safeZoneKind, safeZones, type SafeZoneKind } from "./safe-zones.ts";

test("every vertical format has its zones; others none", () => {
  assert.equal(safeZoneKind("ig_reel"), "reel");
  assert.equal(safeZoneKind("meta_story"), "reelAd");
  assert.equal(safeZoneKind("ig_story"), "story");
  assert.equal(safeZoneKind("fb_story"), "story");
  assert.equal(safeZoneKind("wa_status"), "story");
  assert.equal(safeZoneKind("yt_short"), "short");
  assert.equal(safeZoneKind("ig_feed"), "post");
  assert.equal(safeZoneKind("ig_carousel"), "carousel");
  assert.equal(safeZoneKind("li_image"), null);
  assert.equal(safeZoneKind(null), null);
});

// Inside a polygon (the safe area's outline), by ray casting.
function inside([x, y]: [number, number], poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

test("each kind's areas sit inside the frame, and the safe area clear of them", () => {
  for (const kind of ["reel", "reelAd", "story", "short", "post", "carousel", "feedCrop"] as SafeZoneKind[]) {
    const { covered: shaded, good = [], safe } = safeZones(kind);
    const covered = [...shaded, ...good];
    for (const [x, y] of safe) assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `${kind} corner`);
    for (const a of covered) {
      assert.ok(a.top >= 0 && a.left >= 0 && a.top + a.height <= 100.001 && a.left + a.width <= 100.001, `${kind} ${a.label}`);
      // No point well inside a covered area is in the safe area.
      for (let x = a.left + 0.5; x < a.left + a.width; x += 1)
        for (let y = a.top + 0.5; y < a.top + a.height; y += 1)
          assert.equal(inside([x, y], safe), false, `${kind}: the safe area runs into ${a.label} at ${x},${y}`);
    }
  }
});

test("a Reel's safe area is the guide's: 220px top, 35px sides, 450px foot, an L round the buttons", () => {
  const { safe, covered } = safeZones("reel");
  const px = ([x, y]: [number, number]) => [Math.round((x / 100) * 1080), Math.round((y / 100) * 1920)];
  assert.deepEqual(safe.map(px), [
    [35, 220],
    [1045, 220],
    [1045, 1152],
    [945, 1152],
    [945, 1470],
    [35, 1470],
  ]);
  assert.deepEqual(covered.map((a) => a.label), ["Back and create", "Buttons", "Name and caption"]);
  // Clear just beside the buttons, above them, and at the left.
  assert.equal(inside([90, 40], safe), true);
  assert.equal(inside([90, 70], safe), false);
  assert.equal(inside([2, 40], safe), false);
});

test("the guide's other figures: Stories, Meta ads, posts, carousels, a Reel in the feed", () => {
  const px = (kind: SafeZoneKind, w: number, h: number) =>
    safeZones(kind).safe.map(([x, y]) => [Math.round((x / 100) * w), Math.round((y / 100) * h)]);
  // Stories: 250px no-go top and foot; the safe area inside the good zones.
  const story = safeZones("story");
  assert.equal(Math.round((story.covered[0].height / 100) * 1920), 250);
  assert.equal(Math.round((story.covered[1].height / 100) * 1920), 250);
  assert.equal(story.good?.length, 2);
  // Meta Stories / Reels ads: 220 top, 450 foot, full width.
  assert.deepEqual(px("reelAd", 1080, 1920), [[0, 220], [1080, 220], [1080, 1470], [0, 1470]]);
  // A 3:4 post: 50px sides, 180px top and foot.
  assert.deepEqual(px("post", 1080, 1440), [[50, 180], [1030, 180], [1030, 1260], [50, 1260]]);
  // A carousel: 120px down the right.
  assert.deepEqual(px("carousel", 1080, 1440), [[0, 0], [960, 0], [960, 1440], [0, 1440]]);
  // A Reel in the feed: its middle 1080×1440.
  assert.deepEqual(px("feedCrop", 1080, 1920), [[0, 240], [1080, 240], [1080, 1680], [0, 1680]]);
});
