// Run with: node --experimental-strip-types --test lib/ai/copy-chat-context.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickClientFeedback, pickOtherPosts, type CommentRow, type PostRow } from "./copy-chat-context.ts";
import { buildCopyChatPrompt, type CopyChatContext } from "./copy-chat.ts";

const post = (id: string, stage: number, updated_at: string, extra: Partial<PostRow> = {}): PostRow => ({
  id,
  name: `Post ${id}`,
  stage,
  formatLabel: "Instagram Feed",
  updated_at,
  voiceover: null,
  slide_text: null,
  ...extra,
});

test("other posts: Approved first, newest first, latest copy, only ones with words, up to 8", () => {
  const posts = [
    post("a", 2, "2026-10-09"),
    post("b", 4, "2026-10-01"),
    post("c", 4, "2026-10-05"),
    post("d", 3, "2026-10-08"), // nothing written
    post("e", 2, "2026-10-07", { voiceover: "Say it.", slide_text: ["ONE", "", "TWO"] }),
  ];
  const copies = [
    { creative_id: "a", created_at: "2026-10-01", fields: { caption: "Old" } },
    { creative_id: "a", created_at: "2026-10-02", fields: { caption: "New", alt: "" } },
    { creative_id: "b", created_at: "2026-10-01", fields: { caption: "B words" } },
    { creative_id: "c", created_at: "2026-10-01", fields: { caption: "C words" } },
  ];
  const out = pickOtherPosts(posts, copies, { caption: "Caption" });
  assert.deepEqual(out.map((p) => p.name), ["Post c", "Post b", "Post a", "Post e"]);
  assert.equal(out[0].approved, true);
  assert.deepEqual(out[2].copy, [{ label: "Caption", text: "New" }]);
  assert.deepEqual(out[3].copy, [
    { label: "VO", text: "Say it." },
    { label: "Text on Image", text: "ONE / TWO" },
  ]);
  const many = Array.from({ length: 12 }, (_, i) => post(`p${i}`, 4, `2026-10-${10 + i}`));
  const manyCopies = many.map((p) => ({ creative_id: p.id, created_at: "2026-10-01", fields: { caption: "x" } }));
  assert.equal(pickOtherPosts(many, manyCopies, {}).length, 8);
});

test("feedback: the client's own, last 90 days, real corrections, newest first, up to 20", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const c = (body: string, created_at: string, extra: Partial<CommentRow> = {}): CommentRow => ({
    body,
    created_at,
    author_id: "client-1",
    guest_name: null,
    issue_category: "tone_and_brand",
    post: "Launch",
    ...extra,
  });
  const out = pickClientFeedback(
    [
      c("Less formal please", "2026-10-01T00:00:00Z"),
      c("From the agency", "2026-10-02T00:00:00Z", { author_id: "staff-1" }),
      c("Guest says shorter", "2026-10-03T00:00:00Z", { author_id: null, guest_name: "Asha", issue_category: null }),
      c("Looks great!", "2026-10-04T00:00:00Z", { issue_category: "no_issue" }),
      c("Too old", "2026-06-01T00:00:00Z"),
    ],
    new Set(["client-1"]),
    { tone_and_brand: "Tone and Brand" },
    now,
  );
  assert.deepEqual(out, [
    { post: "Launch", body: "Guest says shorter", category: null },
    { post: "Launch", body: "Less formal please", category: "Tone and Brand" },
  ]);
});

test("the prompt carries the other posts and the feedback, with what to do with each", () => {
  const context: CopyChatContext = {
    postName: "Gummy launch",
    concept: null,
    approachNotes: [],
    formatLabel: "Instagram Feed",
    formatDirection: null,
    agencyNotes: [],
    clientNotes: [],
    fileTitles: [],
    fields: [{ key: "caption", label: "Caption" }],
    otherPosts: [{ name: "Old post", approved: true, formatLabel: "Instagram Reel", copy: [{ label: "Caption", text: "x".repeat(600) }] }],
    clientFeedback: [{ post: "Old post", body: "Never say cheap", category: "Tone and Brand" }],
  };
  const prompt = buildCopyChatPrompt(context, [{ role: "user", body: "Draft" }], {});
  assert.match(prompt, /This client's other posts, for their voice/);
  assert.match(prompt, /never reuse their hooks, lines or phrases/);
  assert.match(prompt, /- "Old post" \(Approved, Instagram Reel\): Caption: x{399}…/);
  assert.match(prompt, /What the client has asked for on their posts in the last 90 days/);
  assert.match(prompt, /- On "Old post" \(Tone and Brand\): Never say cheap/);
  // Without them, neither section.
  const bare = buildCopyChatPrompt({ ...context, otherPosts: [], clientFeedback: [] }, [{ role: "user", body: "Draft" }], {});
  assert.doesNotMatch(bare, /other posts|asked for on their posts/);
});
