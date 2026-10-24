// Run with: node --experimental-strip-types --test lib/concept-format.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptBlocks } from "./concept-format.ts";

test("slides each start their own line, after the prose before them", () => {
  const b = conceptBlocks("Use nostalgic design language. Slide 1: (the bird in the frame) Slide 2: (that's when the gun comes out)");
  assert.deepEqual(b, [
    { kind: "p", text: "Use nostalgic design language." },
    { kind: "slide", label: "Slide 1", text: "the bird in the frame" },
    { kind: "slide", label: "Slide 2", text: "that's when the gun comes out" },
  ]);
});

test("the writer's own breaks are kept; a short concept stays one paragraph", () => {
  assert.deepEqual(conceptBlocks("A warm morning.\n\nThe second thought."), [
    { kind: "p", text: "A warm morning." },
    { kind: "p", text: "The second thought." },
  ]);
});

test("a long run of prose is split at sentence ends", () => {
  const long = Array.from({ length: 8 }, (_, i) => `This is sentence number ${i + 1} about the idea and how it should land.`).join(" ");
  const b = conceptBlocks(long);
  assert.ok(b.length > 1);
  assert.ok(b.every((x) => x.kind === "p" && x.text.length <= 320));
  assert.equal(b.map((x) => x.text).join(" "), long);
});
