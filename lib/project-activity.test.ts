import { test } from "node:test";
import assert from "node:assert/strict";

import { activityLine, namesPost } from "./project-activity.ts";

const row = (kind: string, detail: Record<string, unknown> = {}, by_name: string | null = "Raj", creative_name: string | null = "Diwali Reel") => ({
  kind,
  by_name,
  creative_name,
  detail,
});

test("stage moves say what happened, and a client's approval names the client when no one's signed in", () => {
  assert.deepEqual(activityLine(row("stage", { from: 2, to: 3 })), { who: "Raj", before: "moved ", after: " to Client Review" });
  assert.deepEqual(activityLine(row("stage", { from: 3, to: 4 }, null)), { who: "The client", before: "approved " });
  assert.deepEqual(activityLine(row("stage", { from: 4, to: 3 })), { who: "Raj", before: "took back the approval of " });
  assert.equal(activityLine(row("stage", { from: 3, to: 3, exception: "changes_requested" })).before, "asked for changes on ");
});

test("edits list the fields, comments quote their start, guests are named as guests", () => {
  assert.equal(activityLine(row("post_edited", { fields: ["Concept", "Live date"] })).after, ": Concept, Live date");
  assert.deepEqual(activityLine(row("comment", { internal: true, text: " Too busy " })), {
    who: "Raj",
    before: "left an internal comment on ",
    after: ": “Too busy”",
  });
  assert.equal(activityLine(row("comment", { text: "Love it" }, null)).who, "A guest");
});

test("project changes don't name a post, and an unknown kind still reads", () => {
  assert.equal(activityLine(row("project_renamed", { from: "Q3", to: "Q4" }, "Raj", null)).before, "renamed the project from “Q3” to “Q4”");
  assert.equal(activityLine(row("project_folder", { folder: null }, "Raj", null)).before, "took the project out of its folder");
  assert.equal(namesPost("project_details", "Diwali Reel"), false);
  assert.equal(namesPost("post_deleted", "Diwali Reel"), true);
  assert.equal(activityLine(row("something_new")).before, "made a change");
});

test("a change nobody signed in made still reads as a sentence", () => {
  assert.deepEqual(activityLine(row("person_added", { person: "Asha" }, null, null)), { who: "Someone", before: "gave Asha access" });
  assert.equal(activityLine(row("stage", { from: 2, to: 3 }, null)).who, "Someone");
});
