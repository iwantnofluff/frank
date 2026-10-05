// Run with: node --experimental-strip-types --test lib/links.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkHref, tidyReferences } from "./links.ts";

test("a reference opens as a link, with https:// added when it has no scheme", () => {
  assert.equal(linkHref("example.com/post"), "https://example.com/post");
  assert.equal(linkHref(" https://a.com/x "), "https://a.com/x");
  assert.equal(linkHref("mailto:hi@a.com"), "mailto:hi@a.com");
  assert.equal(linkHref("not a link"), null);
  assert.equal(linkHref("  "), null);
});

test("references are trimmed, blanks dropped, each kept once", () => {
  assert.deepEqual(tidyReferences([" a.com ", "", "b.com", "a.com"]), ["a.com", "b.com"]);
});
