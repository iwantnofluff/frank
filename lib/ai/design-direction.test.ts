import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDesignDirectionPrompt, directionAsNote, parseDesignDirection, type DesignContext } from "./design-direction.ts";

const context: DesignContext = {
  postName: "Autumn Roast",
  formatLabel: "Instagram Carousel",
  concept: "Our autumn blend, warm and slow.",
  approachNotes: [],
  formatDirection: null,
  slideCount: 3,
  frameNoun: "Slide",
  isVideo: false,
  textOnImage: ["Slow mornings", "", ""],
  agencyNotes: [],
  clientNotes: [{ title: "Brand", body: "Never use neon colours." }],
  fileTitles: [],
  clientFeedback: [{ post: "Summer Brew", body: "Logo smaller please", category: "Tone and Brand" }],
  references: [
    { n: 1, url: "https://www.instagram.com/p/abc/", title: "Cafe", description: "166K likes, 1,203 comments", siteName: "Instagram", hasImage: true },
    { n: 2, url: "https://drive.google.com/x", title: null, description: null, siteName: null, hasImage: false },
  ],
};

test("the prompt carries the brief, references, figures and per-slide shape", () => {
  const p = buildDesignDirectionPrompt(context);
  assert.match(p, /Autumn Roast/);
  assert.match(p, /3 slides/);
  assert.match(p, /Reference 1: https:\/\/www\.instagram\.com\/p\/abc\//);
  assert.match(p, /166K likes/);
  assert.match(p, /Reference 2[\s\S]*couldn't be read/);
  assert.match(p, /exactly 3 lines in slides/);
  assert.match(p, /never the words themselves/);
  assert.match(p, /Logo smaller please/);
  assert.match(p, /Never use neon colours/);
  assert.match(p, /Slide 1: Slow mornings/);
  assert.doesNotMatch(p, /"reel"/);
});

test("a video post asks for the reel", () => {
  const p = buildDesignDirectionPrompt({ ...context, slideCount: null, isVideo: true, references: [] });
  assert.match(p, /"reel":\{"hook"/);
  assert.match(p, /References: none given/);
  assert.doesNotMatch(p, /"slides"/);
});

test("the reply is read back, fenced or not, and tidied", () => {
  const reply = `Here you go\n\`\`\`json\n${JSON.stringify({
    summary: "Make it warm.",
    references: [{ n: 1, lessons: ["Big type", ""] }, { n: "x", lessons: ["no"] }],
    worked: ["Close-up product"],
    directions: [
      { title: "Steam", idea: "Steam rising", layout: "Cup centred", slides: ["a", "b", "c", "d"], reel: { hook: "x" } },
      { title: "", idea: "", layout: "" },
      { idea: "Hands", layout: "Top-down" },
    ],
    guardrails: { format: ["4:5"], avoid: ["Big logo"] },
  })}\n\`\`\``;
  const d = parseDesignDirection(reply, 3, false)!;
  assert.equal(d.summary, "Make it warm.");
  assert.deepEqual(d.references, [{ n: 1, lessons: ["Big type"] }]);
  assert.equal(d.directions.length, 2);
  assert.deepEqual(d.directions[0].slides, ["a", "b", "c"]);
  assert.equal(d.directions[0].reel, null);
  assert.equal(d.directions[1].title, "Direction 2");
  assert.deepEqual(d.guardrails, { format: ["4:5"], client: [], avoid: ["Big logo"] });
  assert.ok(parseDesignDirection(`{"directions":[{"idea":"x"}]}`, null, false));
});

test("nothing usable reads as null", () => {
  assert.equal(parseDesignDirection("Sorry, I can't.", null, false), null);
  assert.equal(parseDesignDirection('{"directions":[]}', null, false), null);
});

test("a direction as a note", () => {
  const note = directionAsNote({
    title: "Steam",
    idea: "Steam rising",
    layout: "Cup centred",
    style: "",
    palette: "Warm browns",
    textOnImage: "",
    slides: [],
    reel: { hook: "Pour", shots: ["Pour", "Sip"], end: "Logo" },
  });
  assert.equal(note, "Steam: Steam rising\nLayout: Cup centred\nPalette: Warm browns\nFirst three seconds: Pour\nShots: Pour / Sip\nEnd frame: Logo");
});
