import { test } from "node:test";
import assert from "node:assert/strict";

import { slideFields, tidySlideText } from "./slide-text.ts";
import { carouselMaxSlides, aspectRatioCss } from "./formats.ts";

test("Text on Image: one open field by default, exactly one per slide for a carousel", () => {
  assert.deepEqual(slideFields([], null), [""]);
  assert.deepEqual(slideFields(["a", "b"], null), ["a", "b"]);
  assert.deepEqual(slideFields(["a"], 3), ["a", "", ""]);
  assert.deepEqual(slideFields(["a", "b", "c", "d"], 2), ["a", "b"]);
});

test("saving keeps blank slides in place and drops only trailing ones", () => {
  assert.deepEqual(tidySlideText(["", " two ", "", ""]), ["", "two"]);
  assert.deepEqual(tidySlideText(["", ""]), []);
});

test("carousel limits: 20 for Instagram and LinkedIn, Meta holds a mix to 10, none otherwise", () => {
  assert.equal(carouselMaxSlides(["ig_carousel"]), 20);
  assert.equal(carouselMaxSlides(["li_doc"]), 20);
  assert.equal(carouselMaxSlides(["ig_carousel", "meta_carousel"]), 10);
  assert.equal(carouselMaxSlides(["ig_feed", "meta_feed"]), null);
  assert.equal(aspectRatioCss("ig_carousel"), "4 / 5");
  assert.equal(aspectRatioCss("em_full"), "1 / 1");
});
