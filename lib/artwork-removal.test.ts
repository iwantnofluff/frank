// Run with: node --experimental-strip-types --test lib/artwork-removal.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { artworkRemovalDate } from "./artwork-removal.ts";
import { friendlyUploadError, MAX_UPLOAD_BYTES } from "./upload-limits.ts";

test("an Approved, dated post's artwork goes 7 days after its live date; no other post's does", () => {
  assert.equal(
    artworkRemovalDate({ stage: 4, scheduled_at: "2026-10-06T09:30:00.000Z" })?.toISOString(),
    "2026-10-13T09:30:00.000Z",
  );
  assert.equal(artworkRemovalDate({ stage: 3, scheduled_at: "2026-10-06T09:30:00.000Z" }), null);
  assert.equal(artworkRemovalDate({ stage: 4, scheduled_at: null }), null);
});

test("uploads are 200MB a file, and storage's refusal is said plainly", () => {
  assert.equal(MAX_UPLOAD_BYTES, 200 * 1024 * 1024);
  assert.match(friendlyUploadError("The object exceeded the maximum allowed size"), /bigger than storage accepts/);
  assert.equal(friendlyUploadError("Not signed in"), "Not signed in");
});
