// Run with: node --experimental-strip-types --test lib/project-statuses.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusOptions } from "./project-statuses.ts";

test("a stage's statuses are lettered in order, numbered by stage", () => {
  const list = [
    { id: "p1", stage: 2, label: "In Progress (Content)" },
    { id: "i1", stage: 3, label: "Internal QC (Copy)" },
    { id: "i2", stage: 3, label: "Internal QC (Creative)" },
    { id: "i3", stage: 3, label: "Hold" },
  ];
  assert.deepEqual(statusOptions(list, 3).map((o) => o.text), ["3a. Internal QC (Copy)", "3b. Internal QC (Creative)", "3c. Hold"]);
  assert.deepEqual(statusOptions(list, 2).map((o) => o.code), ["2a"]);
  assert.deepEqual(statusOptions(undefined, 3), []);
});
