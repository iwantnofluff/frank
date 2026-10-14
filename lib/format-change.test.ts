import { test } from "node:test";
import assert from "node:assert/strict";

import { artworkChangeReasons, mediaKind } from "./format-change.ts";

const post = (formats: string[], slideCount: number | null = null) => ({ formats, slideCount });

test("carousel to reel warns about the carousel, the video and the shape", () => {
  const r = artworkChangeReasons(post(["ig_carousel"], 3), post(["ig_reel"]), 3);
  assert.equal(r.length, 3);
  assert.match(r[0], /Instagram Carousel is a carousel and Instagram Reel is a single piece/);
  assert.match(r[1], /an image and Instagram Reel is a video/);
  assert.match(r[2], /4:5 and Instagram Reel is 9:16/);
});

test("a change the artwork still fits says nothing", () => {
  // Adding a second format leaves the main one, and its artwork, as it was.
  assert.deepEqual(artworkChangeReasons(post(["ig_feed"]), post(["ig_feed", "meta_feed"]), 1), []);
  // Story can be either image or video, and shares Reel's 9:16.
  assert.deepEqual(artworkChangeReasons(post(["ig_story"]), post(["ig_reel"]), 1), []);
  // Shapes that vary aren't compared.
  assert.deepEqual(artworkChangeReasons(post(["ooh"]), post(["print"]), 1), []);
  // More slides is fine.
  assert.deepEqual(artworkChangeReasons(post(["ig_carousel"], 3), post(["ig_carousel"], 5), 3), []);
});

test("shape, single to carousel, and fewer slides each warn on their own", () => {
  assert.deepEqual(artworkChangeReasons(post(["ig_feed"]), post(["meta_feed"]), 1), [
    "Instagram Feed is 4:5 and Meta Feed Ad is 1:1.",
  ]);
  assert.deepEqual(artworkChangeReasons(post(["ig_feed"]), post(["ig_carousel"], 3), 1), [
    "Instagram Feed is a single piece and Instagram Carousel is a carousel.",
  ]);
  assert.deepEqual(artworkChangeReasons(post(["ig_carousel"], 5), post(["ig_carousel"], 3), 5), [
    "The carousel goes down to 3 slides, and 5 are uploaded.",
  ]);
});

test("media kinds", () => {
  assert.equal(mediaKind("yt_video"), "video");
  assert.equal(mediaKind("ig_story"), "either");
  assert.equal(mediaKind("sms"), "text");
  assert.equal(mediaKind("ig_feed"), "image");
});

test("artworkChangeReasons: stories", () => {
  const story = (n: number | null) => ({ formats: ["ig_story"], slideCount: n });
  assert.deepEqual(artworkChangeReasons(story(3), story(5), 3), []);
  assert.deepEqual(artworkChangeReasons(story(3), story(2), 3), ["The stories go down to 2, and 3 are uploaded."]);
  assert.deepEqual(artworkChangeReasons(story(3), story(3), 3), []);
  // To a single piece of the same shape: fine with one, not with several.
  assert.deepEqual(artworkChangeReasons(story(1), { formats: ["ig_reel"], slideCount: null }, 1), []);
  assert.deepEqual(artworkChangeReasons(story(2), { formats: ["yt_short"], slideCount: null }, 2), [
    "YouTube Short is a single piece, and 2 are uploaded.",
  ]);
});
