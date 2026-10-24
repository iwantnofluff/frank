// Run with: node --experimental-strip-types --test lib/proofread.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applySuggestion, buildProofreadPrompt, openSuggestions, paragraphSuggestions, parseProofread } from "./proofread.ts";

test("paragraphSuggestions: a paragraph on the next line, not lists or blank-separated ones", () => {
  const text = "Nobody misses on purpose.\nThey just skip the part.\n\nWell spaced.\n- one\n- two";
  const s = paragraphSuggestions("caption", text);
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "paragraph");
  assert.equal(applySuggestion(text, s[0]), "Nobody misses on purpose.\n\nThey just skip the part.\n\nWell spaced.\n- one\n- two");
});

test("parseProofread keeps only real changes to words that are in the field", () => {
  const fields = { caption: "Thsi is a spelling test example" };
  const s = parseProofread(
    'Sure: {"suggestions":[{"field":"caption","from":"Thsi","to":"This","reason":"Typo","kind":"spelling"},' +
      '{"field":"caption","from":"not there","to":"x","reason":"","kind":"grammar"},' +
      '{"field":"alt","from":"Thsi","to":"This","kind":"spelling"},' +
      '{"field":"caption","from":"test","to":"test","kind":"spelling"}]}',
    fields,
  );
  assert.equal(s.length, 1);
  assert.deepEqual({ from: s[0].from, to: s[0].to, kind: s[0].kind }, { from: "Thsi", to: "This", kind: "spelling" });
  assert.deepEqual(parseProofread("no json", fields), []);
});

test("openSuggestions drops ignored ones and those already fixed", () => {
  const [a] = parseProofread('{"suggestions":[{"field":"caption","from":"Thsi","to":"This","kind":"spelling"}]}', { caption: "Thsi is it" });
  assert.equal(openSuggestions([a], [], { caption: "Thsi is it" }).length, 1);
  assert.equal(openSuggestions([a], [a.id], { caption: "Thsi is it" }).length, 0);
  assert.equal(openSuggestions([a], [], { caption: "This is it" }).length, 0);
});

test("the prompt respects style and carries the tone of voice and fields", () => {
  const p = buildProofreadPrompt({ fields: [{ key: "caption", label: "Caption", text: "hello" }], clientName: "Casa", toneOfVoice: ["Warm, lowercase"] });
  assert.match(p, /Respect deliberate style/);
  assert.match(p, /Warm, lowercase/);
  assert.match(p, /<caption> \(Caption\)\nhello\n<\/caption>/);
});
