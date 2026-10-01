// Run with: node --experimental-strip-types --test lib/theme.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_PRESETS, DEFAULT_THEME, matchPreset, normaliseTheme, presetTheme } from "./theme.ts";

test("the original column default (highlight, no private) reads as a full theme", () => {
  const t = normaliseTheme({
    action: "#007BFF",
    rail: "#003C61",
    canvas: "#EDF1F6",
    surface: "#FFFFFF",
    ink: "#14161A",
    line: "#E3E6EA",
    amber: "#FF8A00",
    green: "#2BB65B",
    rose: "#FF0000",
    highlight: "#FFFBF0",
  });
  assert.equal(t.hl, "#FFFBF0");
  assert.equal(t.private, DEFAULT_THEME.private);
});

test("missing, empty or malformed values fall back to the default", () => {
  assert.deepEqual(normaliseTheme(null), DEFAULT_THEME);
  const t = normaliseTheme({ action: "red", rail: "#12345", ink: "#abcdef" });
  assert.equal(t.action, DEFAULT_THEME.action);
  assert.equal(t.rail, DEFAULT_THEME.rail);
  assert.equal(t.ink, "#ABCDEF");
});

test("the default theme is the No Fluff preset", () => {
  assert.equal(matchPreset(DEFAULT_THEME, BUILT_IN_PRESETS), "No Fluff");
});

test("applying a preset starts from the default, and is then recognised", () => {
  const t = presetTheme(BUILT_IN_PRESETS.Forest);
  assert.equal(t.action, "#047857");
  assert.equal(t.surface, DEFAULT_THEME.surface);
  assert.equal(matchPreset(t, BUILT_IN_PRESETS), "Forest");
});

test("a hand-edited theme matches no preset", () => {
  assert.equal(matchPreset({ ...DEFAULT_THEME, action: "#123456" }, BUILT_IN_PRESETS), null);
});

test("colour objects compare equal regardless of key order", async () => {
  const { sameColours } = await import("./theme.ts");
  assert.equal(sameColours({ a: { x: "#1", y: "#2" } }, { a: { y: "#2", x: "#1" } }), true);
  assert.equal(sameColours({ a: { x: "#1" } }, { a: { x: "#2" } }), false);
});
