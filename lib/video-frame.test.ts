import { test } from "node:test";
import assert from "node:assert/strict";
import { frameFileName } from "./video-frame.ts";

test("a frame's file is named for its moment", () => {
  assert.equal(frameFileName(7), "frame-0m07s.jpg");
  assert.equal(frameFileName(7.46), "frame-0m07.4s.jpg");
  assert.equal(frameFileName(65.2), "frame-1m05.2s.jpg");
  assert.equal(frameFileName(0), "frame-0m00s.jpg");
});
