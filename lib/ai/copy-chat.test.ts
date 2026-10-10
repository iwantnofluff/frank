// Run with: node --experimental-strip-types --test lib/ai/copy-chat.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySlideDraft,
  buildCopyChatPrompt,
  cleanReplyBody,
  openingMessage,
  parseCopyChatReply,
  slideTextAsFields,
  slideTextFields,
  VO_FIELD,
  type CopyChatContext,
} from "./copy-chat.ts";

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

test("a reply with no drafts reads whole; broken JSON is never shown", () => {
  assert.deepEqual(parseCopyChatReply("The hook is strong.", fields), { body: "The hook is strong.", drafts: [] });
  const broken = "Try this.\n```json\n{not json}\n```";
  assert.deepEqual(parseCopyChatReply(broken, fields), { body: "Try this.", drafts: [] });
});

test("a reply cut off mid-draft keeps the finished drafts, and no JSON or markdown shows", () => {
  const cut =
    'Here is **where I landed**.\n\n```json\n{"drafts":[{"label":"Mugshot","fields":{"caption":"We lined everyone up {and} read the \\"charges\\"."}},{"label":"Warmer","fields":{"caption":"IG: None of us would';
  const reply = parseCopyChatReply(cut, fields);
  assert.equal(reply.body, "Here is where I landed.");
  assert.deepEqual(reply.drafts, [{ label: "Mugshot", fields: { caption: 'We lined everyone up {and} read the "charges".' } }]);
  assert.equal(cleanReplyBody(cut), "Here is where I landed.");
});

test("a post with several formats is told to write one version of each field", () => {
  const prompt = buildCopyChatPrompt({ ...context, formatLabel: "Instagram Carousel + LinkedIn Carousel (Document)" }, [], {});
  assert.match(prompt, /write one version of each field that works for all of them/);
  assert.match(prompt, /no markdown/);
});

test("Text on Image is one field per slide for a carousel, one otherwise", () => {
  assert.deepEqual(slideTextFields(null), [{ key: "slide_1", label: "Text on Image" }]);
  assert.deepEqual(
    slideTextFields(3).map((f) => f.label),
    ["Text on Image, Slide 1", "Text on Image, Slide 2", "Text on Image, Slide 3"],
  );
  assert.deepEqual(slideTextAsFields(["One", "", "Three"]), { slide_1: "One", slide_2: "", slide_3: "Three" });
});

test("a draft's slides land in place, and slides it leaves out are kept", () => {
  assert.deepEqual(applySlideDraft(["a", "b", "c"], { caption: "x", slide_1: "One", slide_3: "Three" }), ["One", "b", "Three"]);
  assert.deepEqual(applySlideDraft([], { slide_2: "Two" }), ["", "Two"]);
});

test("slide drafts come back through the reply, and the prompt explains them", () => {
  const fields = [{ key: "caption", label: "Caption" }, ...slideTextFields(2)];
  const reply = parseCopyChatReply(
    'Here.\n```json\n{"drafts":[{"label":"A","fields":{"caption":"Hi","slide_1":"Hook","slide_2":"Payoff","slide_9":"no"}}]}\n```',
    fields,
  );
  assert.deepEqual(reply.drafts[0].fields, { caption: "Hi", slide_1: "Hook", slide_2: "Payoff" });
  const prompt = buildCopyChatPrompt({ ...context, fields }, [{ role: "user", body: "Draft" }], {});
  assert.match(prompt, /Text on Image is the words set on the artwork itself/);
  assert.match(prompt, /"slide_2" \(Text on Image, Slide 2\)/);
});

test("a video post's VO is its own field, explained in the prompt and kept from the reply", () => {
  const fields = [{ key: "caption", label: "Caption" }, VO_FIELD];
  const reply = parseCopyChatReply('Here.\n```json\n{"drafts":[{"label":"A","fields":{"caption":"Hi","voiceover":"Say this."}}]}\n```', fields);
  assert.deepEqual(reply.drafts[0].fields, { caption: "Hi", voiceover: "Say this." });
  const prompt = buildCopyChatPrompt({ ...context, fields }, [{ role: "user", body: "Draft" }], {});
  assert.match(prompt, /VO is the voiceover script, spoken over the video/);
  assert.match(prompt, /"voiceover" \(VO\)/);
  // Without it, nothing about VO.
  assert.doesNotMatch(buildCopyChatPrompt(context, [{ role: "user", body: "Draft" }], {}), /voiceover/);
});
