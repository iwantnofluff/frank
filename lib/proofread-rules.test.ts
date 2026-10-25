// Run with: node --experimental-strip-types --test lib/proofread-rules.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applySuggestion, paragraphSuggestions, type ProofreadSuggestion } from "./proofread.ts";
import {
  DEFAULT_AI_PHRASES,
  aiRules,
  codeSuggestions,
  colonSuggestions,
  dashSuggestions,
  hashtagSuggestions,
  repeatSuggestions,
  resolveRules,
  spacingSuggestions,
  wordSuggestions,
  writingRules,
  type ProofreadRuleRow,
} from "./proofread-rules.ts";

const fixAll = (text: string, list: ProofreadSuggestion[]) => list.reduce((t, s) => applySuggestion(t, s), text);
const row = (r: Partial<ProofreadRuleRow>): ProofreadRuleRow => ({
  id: "r",
  kind: "builtin",
  rule_key: null,
  body: null,
  from_word: null,
  to_word: null,
  enabled: true,
  options: {},
  created_at: "2026-10-25T00:00:00Z",
  ...r,
});

test("every built-in is on until a row switches it off", () => {
  const none = resolveRules([]);
  assert.equal(none.on("spelling"), true);
  assert.equal(none.convention, "follow");
  assert.deepEqual(none.phrases, DEFAULT_AI_PHRASES);
  const some = resolveRules([
    row({ rule_key: "spelling", enabled: false }),
    row({ rule_key: "convention", options: { convention: "british" } }),
    row({ rule_key: "ai_phrases", options: { phrases: ["delve"] } }),
    row({ id: "a", kind: "instruction", body: "Never use & in a sentence." }),
    row({ id: "b", kind: "instruction", body: "Off one", enabled: false }),
    row({ id: "c", kind: "word", from_word: "e-commerce", to_word: "ecommerce" }),
  ]);
  assert.equal(some.on("spelling"), false);
  assert.equal(some.on("grammar"), true);
  assert.equal(some.convention, "british");
  assert.deepEqual(some.phrases, ["delve"]);
  assert.deepEqual(some.instructions.map((i) => i.body), ["Never use & in a sentence."]);
  assert.deepEqual(some.words, [{ from: "e-commerce", to: "ecommerce" }]);
});

test("aiRules leaves out what's switched off and carries the workspace's own", () => {
  const rules = resolveRules([
    row({ rule_key: "spelling", enabled: false }),
    row({ rule_key: "convention", options: { convention: "british" } }),
    row({ id: "a", kind: "instruction", body: "Never use & in a sentence." }),
  ]);
  const ai = aiRules(rules, ["Oat & Ember"]);
  const ids = ai.map((r) => r.id);
  assert.ok(!ids.includes("spelling"));
  assert.ok(ids.includes("grammar") && ids.includes("own_1"));
  assert.match(ai.find((r) => r.id === "convention")!.text, /British spelling/);
  assert.match(ai.find((r) => r.id === "names")!.text, /- Oat & Ember/);
  // With every AI rule off there's nothing to ask.
  const off = ["spelling", "grammar", "punctuation", "convention", "names", "hashtags", "no_em_dash", "no_colons", "ai_phrases"];
  assert.equal(aiRules(resolveRules(off.map((k) => row({ rule_key: k, enabled: false }))), []).length, 0);
});

test("spaces: doubles, before punctuation, and missing after", () => {
  const text = "Two  spaces here , and a comma,missing.Then this";
  assert.equal(fixAll(text, spacingSuggestions("caption", text)), "Two spaces here, and a comma, missing. Then this");
  // Prices, times, links and smileys are left alone.
  const fine = "It's 1,000 at 10:30 on nofluff.in :) see you";
  assert.deepEqual(spacingSuggestions("caption", fine), []);
});

test("repeated words, but not hashtags or words meant twice", () => {
  const text = "Book the the table. Bye bye summer. #sale #sale";
  const s = repeatSuggestions("caption", text);
  assert.equal(s.length, 1);
  assert.equal(applySuggestion(text, s[0]), "Book the table. Bye bye summer. #sale #sale");
});

test("hashtags: a hyphen that cuts one short, and the same one twice", () => {
  const text = "New in. #summer-sale #Oats\n\nMore. #oats #treats";
  assert.equal(fixAll(text, hashtagSuggestions("caption", text)), "New in. #summersale #Oats\n\nMore. #treats");
});

test("em dashes and colons the AI left get a plain fix; covered ones don't", () => {
  const text = "Fresh oats — baked daily. The secret: patience. Open 10:30 at https://x.co";
  assert.equal(fixAll(text, dashSuggestions("caption", text, [])), "Fresh oats, baked daily. The secret: patience. Open 10:30 at https://x.co");
  assert.equal(fixAll(text, colonSuggestions("caption", text, [])), "Fresh oats — baked daily. The secret. Patience. Open 10:30 at https://x.co");
  const ai: ProofreadSuggestion[] = [{ id: "x", field: "caption", from: "oats — baked", to: "oats, baked", reason: "", kind: "style" }];
  assert.deepEqual(dashSuggestions("caption", text, ai), []);
});

test("preferred words keep a sentence's capital, and case-only rules match any case", () => {
  const text = "E-commerce is big. We love e-commerce on Linkedin and LinkedIn.";
  const s = wordSuggestions("caption", text, [
    { from: "e-commerce", to: "ecommerce" },
    { from: "LinkedIn", to: "LinkedIn" },
  ]);
  assert.equal(fixAll(text, s), "Ecommerce is big. We love ecommerce on LinkedIn and LinkedIn.");
  // A later match is fixed where it is, not at the first one.
  const twice = "Say hi. Then say hi again.";
  const t = wordSuggestions("caption", twice, [{ from: "hi", to: "hello" }]);
  assert.equal(applySuggestion(twice, t[1]), "Say hi. Then say hello again.");
});

test("an exact space or repeat the AI already fixed shows once; a preferred word still shows", () => {
  const text = "We love e-commerce  , truly the the best.";
  const ai: ProofreadSuggestion[] = [
    { id: "a", field: "caption", from: "e-commerce  ,", to: "e-commerce,", reason: "", kind: "punctuation" },
    { id: "b", field: "caption", from: "the the best", to: "the best", reason: "", kind: "grammar" },
  ];
  const rules = resolveRules([row({ id: "w", kind: "word", from_word: "e-commerce", to_word: "ecommerce" })]);
  assert.deepEqual(codeSuggestions("caption", text, rules, false, ai, paragraphSuggestions).map((s) => s.kind), ["word"]);
  assert.equal(codeSuggestions("caption", text, rules, false, [], paragraphSuggestions).filter((s) => s.kind === "spacing").length, 1);
});

test("codeSuggestions follows the switches", () => {
  const text = "One  two.\nThree — four";
  const all = codeSuggestions("caption", text, resolveRules([]), true, [], paragraphSuggestions);
  assert.deepEqual(new Set(all.map((s) => s.kind)), new Set(["paragraph", "spacing", "style"]));
  const off = resolveRules(["paragraphs", "spacing", "no_em_dash"].map((k) => row({ rule_key: k, enabled: false })));
  assert.deepEqual(codeSuggestions("caption", text, off, true, [], paragraphSuggestions), []);
});

test("writingRules: what changes how copy is written, by the switches, with the workspace's own", () => {
  const all = writingRules(resolveRules([]));
  assert.ok(all.some((r) => r.startsWith("No em dashes")) && all.some((r) => r.startsWith("No colons")));
  assert.ok(all.some((r) => r.includes("game-changer")));
  // Whichever the copy uses needs no rule.
  assert.ok(!all.some((r) => r.includes("spelling throughout")));
  const some = writingRules(
    resolveRules([
      row({ rule_key: "no_colons", enabled: false }),
      row({ rule_key: "convention", options: { convention: "british" } }),
      row({ id: "a", kind: "instruction", body: "Never use & in a sentence." }),
      row({ id: "c", kind: "word", from_word: "e-commerce", to_word: "ecommerce" }),
    ]),
  );
  assert.ok(!some.some((r) => r.startsWith("No colons")));
  assert.ok(some.includes("British spelling throughout (colour, organise, centre, travelled)."));
  assert.ok(some.includes("Never use & in a sentence."));
  assert.ok(some.includes('Write "e-commerce" as "ecommerce".'));
});
