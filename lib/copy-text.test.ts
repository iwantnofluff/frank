// Run with: node --experimental-strip-types --test lib/copy-text.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { captionHtml, tidyForPaste } from "./copy-text.ts";

test("a caption keeps its paragraphs and line breaks for pasting", () => {
  const raw = "\r\nFirst line  \r\nsecond line\r\n\r\n\r\nNew paragraph.\t\n\n";
  assert.equal(tidyForPaste(raw), "First line\nsecond line\n\n\nNew paragraph.");
});

test("as HTML, paragraphs are <p> and single breaks <br>, escaped", () => {
  assert.equal(captionHtml("Hi <you> & me\nline two\n\nPara 2"), "<p>Hi &lt;you&gt; &amp; me<br>line two</p><p>Para 2</p>");
});
