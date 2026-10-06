// Run with: node --experimental-strip-types --test lib/link-preview.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchableUrl, isPrivateAddress, parsePreview } from "./link-preview.ts";

test("private and internal addresses are never fetched", () => {
  for (const ip of ["127.0.0.1", "10.2.3.4", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);
  for (const raw of ["http://localhost/x", "http://127.0.0.1/", "http://[::1]/", "file:///etc/passwd", "ftp://example.com", "https://user:pw@example.com", "http://example.com:8080/", "http://metadata.internal/", "not a url"]) {
    assert.equal(fetchableUrl(raw), null, raw);
  }
  assert.equal(fetchableUrl("https://example.com/post")?.hostname, "example.com");
});

test("preview details come from Open Graph, then Twitter tags, then the title", () => {
  const og = parsePreview(
    `<html><head><title>Plain</title><meta content="A &amp; B" property="og:title"><meta property="og:image" content="/img/card.png"><meta name="description" content="About it"><meta property="og:site_name" content="Example"></head></html>`,
    "https://example.com/articles/1",
  );
  assert.deepEqual(og, {
    url: "https://example.com/articles/1",
    title: "A & B",
    description: "About it",
    image: "https://example.com/img/card.png",
    siteName: "Example",
  });
  const plain = parsePreview("<title>Just a title</title>", "https://www.site.org/");
  assert.equal(plain.title, "Just a title");
  assert.equal(plain.image, null);
  assert.equal(plain.siteName, "site.org");
  // A javascript: image is dropped.
  assert.equal(parsePreview(`<meta property="og:image" content="javascript:alert(1)">`, "https://a.com/").image, null);
});
