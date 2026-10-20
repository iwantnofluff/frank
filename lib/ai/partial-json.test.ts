import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePartialJson } from "./partial-json.ts";

test("a whole object reads as itself, fenced or not", () => {
  assert.deepEqual(parsePartialJson('{"a":1,"b":[1,2]}'), { a: 1, b: [1, 2] });
  assert.deepEqual(parsePartialJson('Here\n```json\n{"a":"x"}\n```\n'), { a: "x" });
});

test("a string cut short is kept as far as it goes", () => {
  assert.deepEqual(parsePartialJson('{"summary":"Make it wa'), { summary: "Make it wa" });
  assert.deepEqual(parsePartialJson('{"summary":"Say \\"hi'), { summary: 'Say "hi' });
  assert.deepEqual(parsePartialJson('{"summary":"ends on \\'), { summary: "ends on " });
});

test("a key with no value yet is dropped", () => {
  assert.deepEqual(parsePartialJson('{"summary":"Done","refe'), { summary: "Done" });
  assert.deepEqual(parsePartialJson('{"summary":"Done","references":'), { summary: "Done" });
  assert.deepEqual(parsePartialJson('{"summary":"Done",'), { summary: "Done" });
});

test("nested arrays and objects close", () => {
  assert.deepEqual(parsePartialJson('{"directions":[{"title":"Steam","slides":["a","b'), {
    directions: [{ title: "Steam", slides: ["a", "b"] }],
  });
  assert.deepEqual(parsePartialJson('{"directions":[{"title":"Steam"},{"ti'), { directions: [{ title: "Steam" }, {}] });
  assert.deepEqual(parsePartialJson('{"n":12'), { n: 12 });
  assert.deepEqual(parsePartialJson('{"ok":tr'), {});
});

test("nothing yet reads as null or empty", () => {
  assert.equal(parsePartialJson(""), null);
  assert.equal(parsePartialJson("```json\n"), null);
  assert.deepEqual(parsePartialJson("```json\n{"), {});
});
