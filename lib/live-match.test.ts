// Run with: node --experimental-strip-types --test lib/live-match.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCaption, sameCaption, kindFits, inWindow, matchLivePosts, type LiveMedia, type ScheduledPost } from "./live-match.ts";

const LONG = "The curve dates to 1908. The goal is not less pressure. It is knowing where you sit on the curve.";

test("normalizeCaption: spacing, line breaks, case and invisible characters don't count", () => {
  assert.equal(normalizeCaption("  Hello\n\nWorld​  "), "hello world");
  assert.equal(normalizeCaption("Ｆｕｌｌ width"), "full width");
});

test("sameCaption: the same words match; a long caption survives a typo, not a rewrite", () => {
  assert.equal(sameCaption("Big Sale\nToday", "big sale today"), true);
  assert.equal(sameCaption(LONG, LONG.replace("1908", "1909")), true);
  assert.equal(sameCaption(LONG, LONG + " Link in bio."), false);
  assert.equal(sameCaption(LONG, "Something else entirely about the curve and 1908 and pressure."), false);
  // A short caption must be the same words.
  assert.equal(sameCaption("New in", "New in!"), false);
  assert.equal(sameCaption("", ""), false);
});

test("kindFits: a Reel to a Reel, a carousel to a carousel, a feed post to a picture or video", () => {
  assert.equal(kindFits(["ig_reel"], { mediaType: "VIDEO", productType: "REELS" }), true);
  assert.equal(kindFits(["ig_feed"], { mediaType: "VIDEO", productType: "REELS" }), false);
  assert.equal(kindFits(["ig_carousel"], { mediaType: "CAROUSEL_ALBUM", productType: "FEED" }), true);
  assert.equal(kindFits(["ig_feed"], { mediaType: "CAROUSEL_ALBUM", productType: "FEED" }), false);
  assert.equal(kindFits(["ig_feed", "fb_feed"], { mediaType: "IMAGE", productType: "FEED" }), true);
  assert.equal(kindFits(["ig_story"], { mediaType: "IMAGE", productType: "FEED" }), false);
});

test("inWindow: two days early to thirty days late", () => {
  const s = "2026-10-10T09:00:00Z";
  assert.equal(inWindow(s, "2026-10-08T09:00:00Z"), true);
  assert.equal(inWindow(s, "2026-10-08T08:59:00Z"), false);
  assert.equal(inWindow(s, "2026-11-09T09:00:00Z"), true);
  assert.equal(inWindow(s, "2026-11-09T09:01:00Z"), false);
});

const post = (id: string, caption: string, scheduledAt = "2026-10-10T09:00:00Z", formats = ["ig_feed"]): ScheduledPost => ({ id, caption, scheduledAt, formats });
const media = (id: string, caption: string | null, timestamp = "2026-10-12T15:30:00Z", mediaType = "IMAGE", productType: string | null = "FEED"): LiveMedia => ({
  id,
  caption,
  timestamp,
  mediaType,
  productType,
  permalink: `https://instagram.com/p/${id}`,
});

test("matchLivePosts: one to one, with when it went live and when it was due", () => {
  const out = matchLivePosts([post("a", LONG), post("b", "Other words")], [media("m1", LONG), media("m2", "Nothing like it")]);
  assert.deepEqual(out, [
    { postId: "a", mediaId: "m1", permalink: "https://instagram.com/p/m1", liveAt: "2026-10-12T15:30:00Z", scheduledAt: "2026-10-10T09:00:00Z" },
  ]);
});

test("matchLivePosts: anything that could be either of two is left alone", () => {
  // Two of Frank's posts with the same caption, one Instagram post.
  assert.deepEqual(matchLivePosts([post("a", LONG), post("b", LONG, "2026-10-11T09:00:00Z")], [media("m1", LONG)]), []);
  // One post, two Instagram posts with its caption.
  assert.deepEqual(matchLivePosts([post("a", LONG)], [media("m1", LONG), media("m2", LONG, "2026-10-13T10:00:00Z")]), []);
  // No caption on Instagram, or the wrong kind, or too late.
  assert.deepEqual(matchLivePosts([post("a", LONG)], [media("m1", null)]), []);
  assert.deepEqual(matchLivePosts([post("a", LONG)], [media("m1", LONG, undefined, "VIDEO", "REELS")]), []);
  assert.deepEqual(matchLivePosts([post("a", LONG)], [media("m1", LONG, "2026-12-01T09:00:00Z")]), []);
});
