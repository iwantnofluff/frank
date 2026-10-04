// Run with: node --experimental-strip-types --test lib/ai/copy-chat.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCopyChatPrompt, openingMessage, parseCopyChatReply, type CopyChatContext } from "./copy-chat.ts";

const fields = [
  { key: "caption", label: "Caption" },
  { key: "alt", label: "Alt text" },
];

const context: CopyChatContext = {
  postName: "Gummy launch",
  concept: "Gummies that taste like dessert",
  approachNotes: ["Health without the chore"],
  formatLabel: "Instagram Feed",
  formatDirection: "Up to 150 characters.",
  agencyNotes: [{ title: "Voice", body: "Plain, warm, no exclamation marks" }],
  clientNotes: [{ title: "Audience", body: "Women 25 to 40" }],
  fileTitles: ["Brand book"],
  fields,
};

test("the prompt carries all four sources, the editor's copy and the conversation", () => {
  const prompt = buildCopyChatPrompt(context, [{ role: "user", body: "Make it shorter" }], { caption: "Tasty and good" });
  for (const part of [
    "Gummies that taste like dessert",
    "Up to 150 characters.",
    "Voice: Plain, warm",
    "Audience: Women 25 to 40",
    "Brand book",
    "Caption: Tasty and good",
    'Colleague: Make it shorter',
    '"caption" (Caption), "alt" (Alt text)',
  ]) {
    assert.ok(prompt.includes(part), `missing: ${part}`);
  }
  assert.ok(prompt.trimEnd().endsWith("You:"));
});

test("reviewing quotes the person's own draft; drafting asks plainly", () => {
  assert.equal(openingMessage("draft", {}, fields), "Draft some copy for this post from the concept.");
  const review = openingMessage("review", { caption: "Tasty and good", alt: "" }, fields);
  assert.ok(review.includes("Caption:\nTasty and good"));
  assert.ok(!review.includes("Alt text"));
});

test("drafts come out of the JSON block, limited to the post's own fields", () => {
  const reply =
    'Two angles to try.\n\n```json\n{"drafts":[{"label":"Playful","fields":{"caption":"Dessert, but make it daily","headline":"nope"}},{"fields":{"caption":"  "}}]}\n```';
  const { body, drafts } = parseCopyChatReply(reply, fields);
  assert.equal(body, "Two angles to try.");
  assert.deepEqual(drafts, [{ label: "Playful", fields: { caption: "Dessert, but make it daily" } }]);
});

test("a reply with no drafts, or broken JSON, is shown whole", () => {
  assert.deepEqual(parseCopyChatReply("The hook is strong.", fields), { body: "The hook is strong.", drafts: [] });
  const broken = "Try this.\n```json\n{not json}\n```";
  assert.deepEqual(parseCopyChatReply(broken, fields), { body: broken, drafts: [] });
});
