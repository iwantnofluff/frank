// Run with: node --experimental-strip-types --test lib/ai/copy-chat-context.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feedbackReach,
  feedbackSince,
  pickClientFeedback,
  pickOtherPosts,
  postsReach,
  postsSince,
  type CommentRow,
  type PostRow,
} from "./copy-chat-context.ts";
import { buildCopyChatPrompt, type CopyChatContext } from "./copy-chat.ts";

const post = (id: string, stage: number, approved_at: string | null, extra: Partial<PostRow> = {}): PostRow => ({
  id,
  name: `Post ${id}`,
  stage,
  formatLabel: "Instagram Post",
  updated_at: approved_at ?? "2026-10-01",
  approved_at,
  voiceover: null,
  slide_text: null,
  ...extra,
});

test("other posts: Approved only, since the chosen point, newest approval first, latest copy, up to 8", () => {
  const posts = [
    post("a", 3, null), // not approved: never
    post("b", 5, "2026-10-01"),
    post("c", 5, "2026-10-05"),
    post("d", 5, "2026-10-08"), // nothing written
    post("e", 5, "2026-10-07", { voiceover: "Say it.", slide_text: ["ONE", "", "TWO"] }),
    post("old", 5, "2025-01-01"),
  ];
  const copies = [
    { creative_id: "a", created_at: "2026-10-02", fields: { caption: "Draft words" } },
    { creative_id: "b", created_at: "2026-10-01", fields: { caption: "Old" } },
    { creative_id: "b", created_at: "2026-10-02", fields: { caption: "B words", alt: "" } },
    { creative_id: "c", created_at: "2026-10-01", fields: { caption: "C words" } },
    { creative_id: "old", created_at: "2025-01-01", fields: { caption: "Long ago" } },
  ];
  const since = postsSince("12m", new Date("2026-10-10T00:00:00Z"));
  const out = pickOtherPosts(posts, copies, { caption: "Caption" }, since);
  assert.deepEqual(out.map((p) => p.name), ["Post e", "Post c", "Post b"]);
  assert.deepEqual(out[2].copy, [{ label: "Caption", text: "B words" }]);
  assert.deepEqual(out[0].copy, [
    { label: "VO", text: "Say it." },
    { label: "Text on Image", text: "ONE / TWO" },
  ]);
  // All time reaches the old one; at most 8.
  assert.ok(pickOtherPosts(posts, copies, { caption: "Caption" }, null).some((p) => p.name === "Post old"));
  const many = Array.from({ length: 12 }, (_, i) => post(`p${i}`, 5, `2026-10-${10 + i}`));
  const manyCopies = many.map((p) => ({ creative_id: p.id, created_at: "2026-10-01", fields: { caption: "x" } }));
  assert.equal(pickOtherPosts(many, manyCopies, {}, null).length, 8);
});

test("the periods: months for posts, days for feedback, null for all time", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  assert.equal(postsSince("3m", now)!.toISOString().slice(0, 10), "2026-07-10");
  assert.equal(postsSince("all", now), null);
  assert.equal(feedbackSince("30d", now)!.toISOString().slice(0, 10), "2026-09-10");
  assert.equal(feedbackSince("all", now), null);
  assert.equal(postsReach("6m"), "from the last 6 months");
  assert.equal(feedbackReach("all"), "from any time");
});

test("feedback: the client's own, since the chosen point, real corrections, newest first, up to 20", () => {
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
  const rows = [
    c("Less formal please", "2026-10-01T00:00:00Z"),
    c("From the agency", "2026-10-02T00:00:00Z", { author_id: "staff-1" }),
    c("Guest says shorter", "2026-10-03T00:00:00Z", { author_id: null, guest_name: "Asha", issue_category: null }),
    c("Looks great!", "2026-10-04T00:00:00Z", { issue_category: "no_issue" }),
    c("Too old", "2026-06-01T00:00:00Z"),
  ];
  const out = pickClientFeedback(rows, new Set(["client-1"]), { tone_and_brand: "Tone and Brand" }, feedbackSince("90d", now));
  assert.deepEqual(out, [
    { post: "Launch", body: "Guest says shorter", category: null },
    { post: "Launch", body: "Less formal please", category: "Tone and Brand" },
  ]);
  // All time includes the old one.
  assert.equal(pickClientFeedback(rows, new Set(["client-1"]), {}, null).length, 3);
});

test("the prompt carries the other posts and the feedback, with what to do with each", () => {
  const context: CopyChatContext = {
    postName: "Gummy launch",
    concept: null,
    approachNotes: [],
    formatLabel: "Instagram Post",
    formatDirection: null,
    agencyNotes: [],
    clientNotes: [],
    fileTitles: [],
    fields: [{ key: "caption", label: "Caption" }],
    otherPosts: [{ name: "Old post", approved: true, formatLabel: "Instagram Reel", copy: [{ label: "Caption", text: "x".repeat(600) }] }],
    clientFeedback: [{ post: "Old post", body: "Never say cheap", category: "Tone and Brand" }],
  };
  const prompt = buildCopyChatPrompt(context, [{ role: "user", body: "Draft" }], {});
  assert.match(prompt, /This client's Approved posts, the voice they've signed off/);
  assert.match(prompt, /never reuse their hooks, lines or phrases/);
  assert.match(prompt, /- "Old post" \(Instagram Reel\): Caption: x{399}…/);
  assert.match(prompt, /What the client has asked for in their comments/);
  assert.match(prompt, /- On "Old post" \(Tone and Brand\): Never say cheap/);
  // Without them, neither section.
  const bare = buildCopyChatPrompt({ ...context, otherPosts: [], clientFeedback: [] }, [{ role: "user", body: "Draft" }], {});
  assert.doesNotMatch(bare, /Approved posts|asked for in their comments/);
});
