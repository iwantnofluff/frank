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
  // A continuous project asks for its Live Date and destination instead.
  const c = buildVoicePostPrompt({ transcript: "x", today: "2026-10-17", weekday: "Saturday", delivery: "continuous", formats: [], team: [] });
  assert.match(c, /"dueOn": the Live Date/);
  assert.doesNotMatch(c, /"date": the Publish Date/);
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
