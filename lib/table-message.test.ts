import { test } from "node:test";
import assert from "node:assert/strict";
import { tableMessage } from "./table-message.ts";

const link = "https://x.beingfrank.app/projects/abc";

test("Just Link is the link alone", () => {
  assert.equal(tableMessage({ kind: "link", projectName: "Content Planner", planner: true, link }), link);
});

test("Link + Instructions, as written", () => {
  assert.equal(
    tableMessage({ kind: "instructions", projectName: "Content Planner", planner: true, link }),
    [
      "Hello,",
      "",
      "Your content planner \"Content Planner\" is ready for review:",
      "",
      link,
      "",
      "1. Open the link.",
      "2. Log in with the email we invited you with.",
      "3. Open any post in the content planner to see it in full.",
      "4. Comment directly on anything you’d like changed. You can pause a video to comment on a specific moment.",
      "",
      "No login yet? Reply here and we’ll send you an invite.",
      "",
      "Any questions? Just reply here.",
    ].join("\n"),
  );
});

test("Link + Review, as written, and a project that isn't a planner", () => {
  assert.equal(
    tableMessage({ kind: "review", projectName: "Launch", planner: false, link }),
    [
      "Hello,",
      "",
      "Your project \"Launch\" is ready for review:",
      "",
      link,
      "",
      "Log in to see everything planned, and comment directly on any post you’d like changed.",
      "",
      "Any questions? Just reply here.",
    ].join("\n"),
  );
});
