import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewMessage } from "./review-message.ts";

const link = "https://x.beingfrank.app/review/hapi/smile/abc";

test("Link + Instructions, as written", () => {
  assert.equal(
    reviewMessage({ kind: "instructions", title: "Don’t wait until you lose it all", titleIs: "post", link, canApprove: true }),
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
    reviewMessage({ kind: "request", title: "Don’t wait until you lose it all", titleIs: "post", link, canApprove: true }),
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
  assert.ok(reviewMessage({ kind: "request", title: "Smile Week", titleIs: "project", link, canApprove: true }).includes("The project \"Smile Week\" is ready"));
});

test("Link Only is the link", () => {
  assert.equal(reviewMessage({ kind: "link", title: "T", titleIs: "post", link, canApprove: true }), link);
});

test("no Approve when the link can't approve", () => {
  const steps = reviewMessage({ kind: "instructions", title: "T", titleIs: "post", link, canApprove: false });
  assert.ok(!steps.includes("Approve"));
  assert.ok(steps.includes("3. Scroll down") && !steps.includes("4."));
  const request = reviewMessage({ kind: "request", title: "T", titleIs: "post", link, canApprove: false });
  assert.ok(request.includes("Comment directly on anything you’d like changed.\n"));
  assert.ok(!request.includes("Approve"));
});
