// Run with: node --experimental-strip-types --test lib/help-links.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { HELP_ARTICLES, HELP_LINK } from "./help-content.ts";
import { SETTINGS_SECTIONS } from "./settings-nav.ts";
import { clientSettingsSections } from "./client-settings-nav.ts";

// Every link in Help's text goes somewhere real (phase147): a workspace
// page in Settings' menu (or Clients, or My Profile), a client's page or a
// Client Settings page, a project, or another topic.
test("every help link's target exists", () => {
  const workspace = new Set(["/dashboard", "/profile", ...SETTINGS_SECTIONS.flatMap((s) => s.pages.filter((p) => !p.soon).map((p) => p.href))]);
  const client = new Set(["", ...clientSettingsSections("ID", true).flatMap((s) => s.pages.map((p) => p.href.replace("/clients/ID", "")))]);
  const topics = new Set(HELP_ARTICLES.map((a) => a.id));
  const wrong: string[] = [];
  let count = 0;
  for (const a of HELP_ARTICLES) {
    const texts = a.blocks.flatMap((b) => ("items" in b ? b.items : [b.text]));
    for (const t of texts) {
      for (const m of t.matchAll(HELP_LINK)) {
        count += 1;
        const target = m[2];
        const ok = target.startsWith("client:")
          ? client.has(target.slice(7))
          : target.startsWith("help:")
            ? topics.has(target.slice(5))
            : target === "project:" || target === "assets:" || workspace.has(target);
        if (!ok) wrong.push(`${a.id}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
  assert.ok(count > 100, `only ${count} links`);
});
