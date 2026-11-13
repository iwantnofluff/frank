// Run with: node --experimental-strip-types --test lib/slack/message.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeSlack, listItemFields, matchListColumns, slackMessage, type SlackEvent } from "./message.ts";

const event = (over: Partial<SlackEvent> = {}): SlackEvent => ({
  kind: "client_comment",
  who: "Priya Shah (Casa Carigar)",
  postName: "Diwali Teaser",
  projectName: "Q4 Social",
  clientName: "Casa Carigar",
  body: "Logo bigger, please",
  isPrivate: false,
  url: "https://nofluff.beingfrank.app/creatives/p1?comment=c1",
  ...over,
});

const texts = (blocks: unknown[]) => JSON.stringify(blocks);

test("says who did what on which post, with the words quoted and a button", () => {
  const m = slackMessage(event());
  assert.equal((m.blocks[0] as { text: { text: string } }).text.text, "*Priya Shah (Casa Carigar)* commented on *Diwali Teaser*");
  assert.equal((m.blocks[1] as { text: { text: string } }).text.text, ">Logo bigger, please");
  assert.match(texts(m.blocks), /Q4 Social · Casa Carigar/);
  assert.match(texts(m.blocks), /"url":"https:\/\/nofluff.beingfrank.app\/creatives\/p1\?comment=c1"/);
  assert.equal(m.text, "Priya Shah (Casa Carigar) commented on Diwali Teaser: Logo bigger, please");
});

test("each kind has its own words; an approval with nothing said has no quote", () => {
  assert.match(texts(slackMessage(event({ kind: "changes_requested" })).blocks), /asked for changes on/);
  const approved = slackMessage(event({ kind: "client_approval", body: null }));
  assert.match(texts(approved.blocks), /approved \*Diwali Teaser\*/);
  assert.equal(approved.blocks.length, 3);
  assert.equal(approved.text, "Priya Shah (Casa Carigar) approved Diwali Teaser");
});

test("a Private comment says so", () => {
  assert.match(texts(slackMessage(event({ kind: "team_comment", isPrivate: true })).blocks), /Private comment, for the team/);
  assert.doesNotMatch(texts(slackMessage(event()).blocks), /Private/);
});

test("Slack's own markup is escaped, every line is quoted, and long words are cut", () => {
  assert.equal(escapeSlack("a < b & c > d"), "a &lt; b &amp; c &gt; d");
  const m = slackMessage(event({ body: "One <b>\nTwo & three", postName: "A & B" }));
  assert.equal((m.blocks[1] as { text: { text: string } }).text.text, ">One &lt;b&gt;\n>Two &amp; three");
  assert.match((m.blocks[0] as { text: { text: string } }).text.text, /\*A &amp; B\*/);
  const long = slackMessage(event({ body: "x".repeat(2000) }));
  assert.equal((long.blocks[1] as { text: { text: string } }).text.text.length, 1 + 1500 + 1);
});

test("whoever's mentioned is tagged where Slack knows them, named otherwise, and the tags lead the notification", () => {
  const m = slackMessage(event({ kind: "team_comment", mentions: [{ name: "Raj Rana", slackId: "U123" }, { name: "Mira <B>", slackId: null }] }));
  assert.match(texts(m.blocks), /Mentions: <@U123>, Mira &lt;B&gt;/);
  assert.ok(m.text.startsWith("<@U123> Priya Shah"));
  assert.doesNotMatch(texts(slackMessage(event()).blocks), /Mentions/);
});

test("a List's columns are found by name, the first one taking the headline; others are left alone", () => {
  const cols = matchListColumns([
    { id: "C1", name: "Title", type: "text", is_primary_column: true },
    { id: "C2", name: "Client", type: "text" },
    { id: "C3", name: "Link", type: "link" },
    { id: "C4", name: "Comment", type: "rich_text" },
    { id: "C5", name: "Status", type: "select" },
    { id: "C6", name: "From", type: "user" },
  ]);
  assert.deepEqual(cols, {
    title: { id: "C1", type: "text" },
    client: { id: "C2", type: "text" },
    link: { id: "C3", type: "link" },
    comment: { id: "C4", type: "rich_text" },
  });
  const fields = listItemFields(cols, event({ kind: "changes_requested", body: "Swap the photo" }));
  const byId = Object.fromEntries(fields.map((f) => [f.column_id as string, f]));
  assert.equal(JSON.stringify(byId.C1), JSON.stringify({ column_id: "C1", rich_text: [{ type: "rich_text", elements: [{ type: "rich_text_section", elements: [{ type: "text", text: "Priya Shah (Casa Carigar) asked for changes on Diwali Teaser" }] }] }] }));
  assert.deepEqual(byId.C3, { column_id: "C3", link: [{ original_url: "https://nofluff.beingfrank.app/creatives/p1?comment=c1", display_as_url: false, display_name: "Open in Frank" }] });
  assert.match(JSON.stringify(byId.C4), /Swap the photo/);
  // An approval says nothing, so its Comment cell stays empty.
  assert.equal(listItemFields(cols, event({ kind: "client_approval", body: null })).some((f) => f.column_id === "C4"), false);
});
