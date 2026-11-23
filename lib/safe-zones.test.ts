import { test } from "node:test";
import assert from "node:assert/strict";
import { safeZoneKind, safeZones, type SafeZoneKind } from "./safe-zones.ts";

test("every vertical format has its zones; others none", () => {
  assert.equal(safeZoneKind("ig_reel"), "reel");
  assert.equal(safeZoneKind("meta_story"), "reel");
  assert.equal(safeZoneKind("ig_story"), "story");
  assert.equal(safeZoneKind("fb_story"), "story");
  assert.equal(safeZoneKind("wa_status"), "story");
  assert.equal(safeZoneKind("yt_short"), "short");
  assert.equal(safeZoneKind("ig_feed"), null);
  assert.equal(safeZoneKind(null), null);
});

test("each kind's areas sit inside the frame, and the safe area clear of them", () => {
  for (const kind of ["reel", "story", "short"] as SafeZoneKind[]) {
    const { covered, safe } = safeZones(kind);
    for (const a of covered) {
      assert.ok(a.top >= 0 && a.left >= 0 && a.top + a.height <= 100.001 && a.left + a.width <= 100.001, `${kind} ${a.label}`);
      const overlaps = safe.left < a.left + a.width && a.left < safe.left + safe.width && safe.top < a.top + a.height && a.top < safe.top + safe.height;
      assert.equal(overlaps, false, `${kind}: the safe area overlaps ${a.label}`);
    }
  }
});
