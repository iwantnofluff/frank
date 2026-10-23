// Run with: node --experimental-strip-types --test lib/notes-format.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { noteBlocks } from "./notes-format.ts";

test("noteBlocks: labels become headings, their text under them", () => {
  assert.deepEqual(noteBlocks("Layout: A single loop\nType and placement: Sans, beside each node"), [
    { kind: "head", text: "Layout" },
    { kind: "p", text: "A single loop" },
    { kind: "head", text: "Type and placement" },
    { kind: "p", text: "Sans, beside each node" },
  ]);
});

test("noteBlocks: a label on its own line, then bullets, is a heading and a list", () => {
  assert.deepEqual(noteBlocks("Guardrails:\n- One idea only.\n- No emojis.\n\nThanks"), [
    { kind: "head", text: "Guardrails" },
    { kind: "list", items: ["One idea only.", "No emojis."] },
    { kind: "p", text: "Thanks" },
  ]);
});

test("noteBlocks: sentences, links and times stay as they are", () => {
  const text = "Make it warm. Keep it simple: no props.\nhttps://example.com/a\nAt 10:30 the light changes\nThis is a long sentence that happens to have a colon: here";
  assert.deepEqual(
    noteBlocks(text).map((b) => b.kind),
    ["p", "p", "p", "p"],
  );
});
