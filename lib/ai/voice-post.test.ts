// Run with: node --experimental-strip-types --test lib/ai/voice-post.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVoicePostPrompt, parseVoicePost } from "./voice-post.ts";

const allowed = { formatIds: new Set(["ig_feed", "ig_carousel"]), teamIds: new Set(["u1", "u2"]) };

test("buildVoicePostPrompt: today, the formats and team by id, and what was said", () => {
  const p = buildVoicePostPrompt({
    transcript: "  A carousel on the 20th with Hannah ",
    today: "2026-10-17",
    weekday: "Saturday",
    delivery: "scheduled",
    formats: [{ id: "ig_carousel", label: "Instagram Carousel" }],
    team: [{ id: "u1", name: "Hannah Cardozo" }],
  });
  assert.match(p, /Today is Saturday 2026-10-17/);
  assert.match(p, /ig_carousel: Instagram Carousel/);
  assert.match(p, /u1: Hannah Cardozo/);
  assert.match(p, /"""A carousel on the 20th with Hannah"""/);
  assert.match(p, /"date": the Publish Date/);
  // A continuous project asks for its Live Date instead.
  const c = buildVoicePostPrompt({ transcript: "x", today: "2026-10-17", weekday: "Saturday", delivery: "continuous", formats: [], team: [] });
  assert.match(c, /"dueOn": the Live Date/);
  assert.doesNotMatch(c, /"date": the Publish Date/);
});

test("buildVoicePostPrompt: an existing post changes only what's said, keeping its name and concept", () => {
  const p = buildVoicePostPrompt({
    transcript: "Move it to Friday and add Hannah",
    today: "2026-10-17",
    weekday: "Saturday",
    delivery: "scheduled",
    formats: [{ id: "ig_feed", label: "Instagram Post" }],
    team: [{ id: "u1", name: "Hannah Cardozo" }, { id: "u2", name: "Aditya Agrawal" }],
    current: {
      name: "Testing AI",
      formats: ["ig_feed"],
      slideCount: null,
      date: "",
      time: "09:00",
      dueOn: "",
      concept: "A mental movie of a brand owner hitting sales targets.",
      referenceUrls: [],
      teamUserIds: ["u2"],
    },
  });
  assert.match(p, /This post already exists\. Change only what they talk about/);
  assert.match(p, /name: Testing AI/);
  assert.match(p, /concept: A mental movie of a brand owner hitting sales targets\./);
  assert.match(p, /teamUserIds: u2/);
  assert.match(p, /"name": only if they rename it/);
  assert.doesNotMatch(p, /make one from what it/);
  assert.match(p, /keeping what's there and working in what they said/);
});

test("parseVoicePost: keeps real formats, team, dates and times; drops the rest", () => {
  const f = parseVoicePost(
    'Here you go: {"name":"Night Feed Dad","formats":["ig_carousel","tiktok","ig_carousel"],"slideCount":5,' +
      '"date":"2026-10-20","time":"09:00","concept":"A dad doing the night feed.","teamUserIds":["u2","nobody"],' +
      '"referenceUrls":["https://example.com/a",""]}',
    allowed,
  );
  assert.deepEqual(f, {
    name: "Night Feed Dad",
    formats: ["ig_carousel"],
    slideCount: 5,
    date: "2026-10-20",
    time: "09:00",
    concept: "A dad doing the night feed.",
    referenceUrls: ["https://example.com/a"],
    teamUserIds: ["u2"],
  });
});

test("parseVoicePost: bad dates, times and counts are dropped; no JSON gives nothing", () => {
  assert.deepEqual(parseVoicePost('{"date":"20 Oct","time":"9am","slideCount":40,"formats":[]}', allowed), {});
  assert.deepEqual(parseVoicePost("Sorry, I couldn't understand that.", allowed), {});
  assert.deepEqual(parseVoicePost("{not json}", allowed), {});
});
