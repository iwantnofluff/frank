import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewMessage } from "./review-message.ts";

const link = "https://x.beingfrank.app/review/hapi/smile/abc";

test("Link + Instructions, as written", () => {
  assert.equal(
    reviewMessage({ kind: "instructions", postName: "Don’t wait until you lose it all", others: false, link, canApprove: true }),
    [
      "Hello,",
      "",
      "The post \"Don’t wait until you lose it all\" is ready for review:",
      "",
      link,
      "",
      "No account needed.",
      "",
      "1. Open the link.",
      "2. Pick your name.",
      "3. Scroll down to comment. You can pause a video to comment on a specific moment.",
      "4. Hit Approve if you’re happy.",
      "",
      "Want to see your full content planner? Create a login using the same link. Optional.",
      "",
      "Any questions? Just reply here.",
    ].join("\n"),
  );
});

test("Link + Request, as written", () => {
  assert.equal(
    reviewMessage({ kind: "request", postName: "Don’t wait until you lose it all", others: false, link, canApprove: true }),
    [
      "Hello,",
      "",
      "The post \"Don’t wait until you lose it all\" is ready for review:",
      "",
      link,
      "",
      "Comment directly on anything you’d like changed, or hit Approve if you’re happy.",
      "",
      "Any questions? Just reply here.",
    ].join("\n"),
  );
});

test("several posts: one by name, and others", () => {
  for (const kind of ["request", "instructions"] as const) {
    const m = reviewMessage({ kind, postName: "Smile Week Reel", others: true, link, canApprove: true });
    assert.ok(m.includes('\n\nThe post "Smile Week Reel", and others are ready for review:\n\n'));
    assert.ok(!m.includes("project"));
  }
});

test("Link Only is the link", () => {
  assert.equal(reviewMessage({ kind: "link", postName: "T", others: false, link, canApprove: true }), link);
});

test("no Approve when the link can't approve", () => {
  const steps = reviewMessage({ kind: "instructions", postName: "T", others: false, link, canApprove: false });
  assert.ok(!steps.includes("Approve"));
  assert.ok(steps.includes("3. Scroll down") && !steps.includes("4."));
  const request = reviewMessage({ kind: "request", postName: "T", others: false, link, canApprove: false });
  assert.ok(request.includes("Comment directly on anything you’d like changed.\n"));
  assert.ok(!request.includes("Approve"));
});
