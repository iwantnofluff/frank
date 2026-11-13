// Run with: node --experimental-strip-types --test lib/slack/message.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeSlack, slackMessage, type SlackEvent } from "./message.ts";

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
