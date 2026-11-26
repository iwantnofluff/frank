import { test } from "node:test";
import assert from "node:assert/strict";
import { tableMessage } from "./table-message.ts";

const link = "https://x.beingfrank.app/projects/abc";

test("Just Link is the link alone", () => {
  assert.equal(tableMessage({ kind: "link", projectName: "Content Planner", planner: true, link }), link);
});

test("Link + Instructions, as written: a month's concepts", () => {
  assert.equal(
    tableMessage({ kind: "instructions", projectName: "Content Planner", planner: true, link, month: "Dec", conceptsOnly: true, count: 15 }),
    [
      "Hello,",
      "",
      "Your Dec concepts for Content Planner are ready for review:",
      "",
      link,
      "",
      "1. Open the link.",
      "2. Log in with the email we invited you with.",
      "3. Comment directly in the table’s Client Feedback column, or",
      "4. Open any post in the content planner to see it in full and comment there. Pause a video to comment on a specific moment.",
      "",
      "No login yet? Reply here and we’ll send you an invite.",
      "",
      "Any questions? Just reply here.",
    ].join("\n"),
  );
});

test("one post is worded as one; no month when it opens on whatever month it is", () => {
  const text = tableMessage({ kind: "instructions", projectName: "Launch", planner: true, link, count: 1, feedbackColumn: "Feedback" });
  assert.match(text, /^Hello,\n\nYour post for Launch is ready for review:\n/);
  assert.match(text, /3\. Comment directly in the table’s Feedback column, or\n4\. Open the post in the content planner to see it in full and comment there/);
});

test("Link + Review, as written, and a project that isn't a planner", () => {
  assert.equal(
    tableMessage({ kind: "review", projectName: "Launch", planner: false, link, month: "Mar", count: 3 }),
    [
      "Hello,",
      "",
      "Your Mar assets for Launch are ready for review:",
      "",
      link,
      "",
      "Log in to comment in the table’s Client Feedback column, or open any post to see it in full and comment there.",
      "",
      "Any questions? Just reply here.",
    ].join("\n"),
  );
});
