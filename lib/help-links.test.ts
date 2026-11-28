// Run with: node --experimental-strip-types --test lib/help-links.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { HELP_ARTICLES, HELP_LINK, helpArticle, helpVisible, searchHelp } from "./help-content.ts";
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

// What a client sees is the team's to read; signed in against a review
// link is a client's (direct instruction). Neither shows until it's known
// who's asking.
test("the client-view article is the team's, the signed-in-or-link one a client's", () => {
  const team = helpArticle("client-view")!;
  const client = helpArticle("signed-in-or-link")!;
  assert.equal(helpVisible(team, true), true);
  assert.equal(helpVisible(team, false), false);
  assert.equal(helpVisible(client, false), true);
  assert.equal(helpVisible(client, true), false);
  assert.equal(helpVisible(team, null), false);
  assert.equal(helpVisible(helpArticle("comments")!, false), true);
  assert.ok(searchHelp("review link signed", false).some((a) => a.id === "signed-in-or-link"));
  assert.ok(!searchHelp("review link signed", true).some((a) => a.id === "signed-in-or-link"));
});
