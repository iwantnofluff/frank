#!/usr/bin/env node
// Throwaway audit script (Phase 1 of the prototype-parity pass) — not part
// of the app. Parses the <style> block out of project-details/frank-
// prototype.html and app/globals.css, extracts every declaration block from
// both, normalises formatting so reformatting alone never registers as
// drift, and classifies every prototype selector into one of five buckets.
// Never edits either input file. Writes docs/css-coverage.md.
//
// Run with: node scripts/css-coverage.mjs

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROTOTYPE_PATH = path.join(ROOT, "project-details/frank-prototype.html");
const APP_CSS_PATH = path.join(ROOT, "app/globals.css");
const OUT_PATH = path.join(ROOT, "docs/css-coverage.md");

const prototypeHtml = readFileSync(PROTOTYPE_PATH, "utf8");
const appCss = readFileSync(APP_CSS_PATH, "utf8");

// ---------------------------------------------------------------------------
// 1. Isolate the prototype's <style> block
// ---------------------------------------------------------------------------

const styleMatch = prototypeHtml.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) throw new Error("Could not find <style> block in prototype");
const prototypeCss = styleMatch[1];
const styleBlockStartLine = prototypeHtml.slice(0, styleMatch.index).split("\n").length;
const styleBlockEndLine =
  styleBlockStartLine + styleMatch[1].split("\n").length + 1;

// ---------------------------------------------------------------------------
// 2. Mini CSS parser — string-aware, so a `;` or `:` inside a quoted
//    data-URI (the <select> chevron backgrounds) never gets mistaken for a
//    declaration boundary.
// ---------------------------------------------------------------------------

function stripComments(css) {
  let out = "";
  let inStr = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += css[i + 1] ?? "";
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      out += c;
      continue;
    }
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
      continue;
    }
    out += c;
  }
  return out;
}

// Splits `str` on top-level occurrences of `delim` (a single char),
// respecting quoted strings. Used for both rule-splitting (`;`) and
// selector-splitting (`,`).
function splitTopLevel(str, delim) {
  const parts = [];
  let depth = 0;
  let inStr = null;
  let buf = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      buf += c;
      if (c === "\\") {
        buf += str[i + 1] ?? "";
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === delim && depth <= 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  if (buf.trim() !== "") parts.push(buf);
  return parts;
}

// Parses a top-level sequence of `header{body}` blocks (string-aware for
// the brace matching too, since nothing here nests inside a string, but a
// stray brace inside a quoted value must not be counted).
function parseBlocks(css) {
  const blocks = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    let j = i;
    let inStr = null;
    let braceIdx = -1;
    while (j < n) {
      const c = css[j];
      if (inStr) {
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === inStr) inStr = null;
        j++;
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = c;
        j++;
        continue;
      }
      if (c === "{") {
        braceIdx = j;
        break;
      }
      j++;
    }
    if (braceIdx === -1) break;
    const header = css.slice(i, braceIdx).trim();
    let depth = 1;
    let k = braceIdx + 1;
    inStr = null;
    while (k < n && depth > 0) {
      const c = css[k];
      if (inStr) {
        if (c === "\\") {
          k += 2;
          continue;
        }
        if (c === inStr) inStr = null;
        k++;
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = c;
        k++;
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") depth--;
      k++;
    }
    const body = css.slice(braceIdx + 1, k - 1);
    blocks.push({ header, body });
    i = k;
  }
  return blocks;
}

function normaliseMediaHeader(header) {
  return header
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function normaliseSelector(sel) {
  return sel
    .replace(/'/g, '"')
    .replace(/\s*([>+~])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function expandHex(v) {
  return v.replace(/#([0-9a-fA-F]{3,4})\b/g, (m, hex) => {
    if (hex.length === 3 || hex.length === 4) {
      return "#" + hex.split("").map((c) => c + c).join("");
    }
    return m;
  });
}

function normaliseValue(v) {
  let out = v.trim().toLowerCase();
  out = expandHex(out);
  out = out.replace(/\s+/g, " ");
  out = out.replace(/\s*,\s*/g, ",");
  out = out.replace(/\s*!\s*important/g, "!important");
  // bare .N -> 0.N, but not inside url("...") data URIs — those never
  // contain a bare leading-dot number, so this is safe unconditionally.
  out = out.replace(/(^|[^0-9])\.([0-9])/g, "$10.$2");
  return out.trim();
}

// Parses one declaration block into an ordered list of [prop, normalisedValue]
// pairs (order-preserving, since later same-property declarations within a
// single rule must still win over earlier ones in that same rule).
function parseDeclarations(body) {
  return splitTopLevel(body, ";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const idx = d.indexOf(":");
      if (idx === -1) return null; // malformed/empty — ignore
      const prop = d.slice(0, idx).trim().toLowerCase();
      const value = normaliseValue(d.slice(idx + 1));
      return [prop, value];
    })
    .filter(Boolean);
}

// Walks parsed blocks, recursing into @media, and returns a flat map of
// `key -> { propMap, rawBodies, media }` where key is `[media::]selector`
// for every individual selector (grouped selectors are split so
// `.a,.b{...}` produces two keys sharing the same declarations).
//
// A hand-written stylesheet routinely defines the same selector more than
// once (a base rule, then a second small rule elsewhere that adds or
// overrides a couple of properties on the same class) — that's normal CSS
// cascade, not drift. Declarations are merged into one accumulator per key,
// later rule wins per-property, matching how a browser would actually
// resolve it, within the same media context. A media-query rule is treated
// as the delta it declares, not merged with the base rule's declarations —
// this audits declared overrides, not fully computed styles at each
// breakpoint.
function extractRuleMap(css) {
  const clean = stripComments(css);
  const map = new Map();
  let ruleCount = 0;
  let declCount = 0;

  function walk(blocks, media) {
    for (const { header, body } of blocks) {
      if (header.startsWith("@media")) {
        const mediaKey = normaliseMediaHeader(header.replace(/^@media\s*/, ""));
        walk(parseBlocks(body), mediaKey);
        continue;
      }
      if (header.startsWith("@")) continue; // other at-rules (none expected here)
      const decls = parseDeclarations(body);
      declCount += decls.length;
      ruleCount++;
      const selectors = splitTopLevel(header, ",").map(normaliseSelector).filter(Boolean);
      for (const sel of selectors) {
        const key = media ? `@media ${media} :: ${sel}` : sel;
        let entry = map.get(key);
        if (!entry) {
          entry = { propMap: new Map(), rawBodies: [], rawSelector: sel, media: media || null };
          map.set(key, entry);
        }
        for (const [prop, value] of decls) entry.propMap.set(prop, value);
        entry.rawBodies.push(body.trim());
      }
    }
  }

  walk(parseBlocks(clean), null);

  // Finalise: turn each entry's propMap into a sorted fingerprint string and
  // a display body (all contributing raw blocks, in file order — several
  // when the selector was defined more than once).
  for (const entry of map.values()) {
    const fp = [...entry.propMap.entries()]
      .map(([p, v]) => `${p}:${v}`)
      .sort()
      .join(";");
    entry.fingerprint = fp;
    entry.rawBody = entry.rawBodies.join("\n/* + (same selector, later in file) */\n");
  }

  return { map, ruleCount, declCount };
}

const proto = extractRuleMap(prototypeCss);
const app = extractRuleMap(appCss);

// ---------------------------------------------------------------------------
// 3. Screen attribution for prototype selectors — used only to split
//    "Missing" into reachable vs deferred-no-surface, and for per-screen
//    grouping. This is a heuristic, not a guarantee; anything it can't place
//    with confidence is reported separately rather than silently bucketed.
// ---------------------------------------------------------------------------

const VIEW_ID_TO_SCREEN = {
  dash: "dashboard",
  review: "review",
  projects: "projects",
  knowledge: "knowledge",
  calendar: "calendar",
  analytics: "analytics",
  visibility: "visibility",
  settings: "settings",
};
const BUILT_SCREENS = new Set(["dashboard", "review", "projects", "knowledge", "settings", "shell"]);
const DEFERRED_SCREENS = new Set(["calendar", "analytics", "visibility", "notifications", "search"]);

// High-confidence manual overrides for the two overlay panels that have no
// `<section id="v-...">` wrapper at all (they float over whatever screen is
// active), so the boundary scan below can never place them correctly on its
// own. Curated by reading the relevant CSS section headers directly — see
// the Phase 0/1 report for how these were identified, not guessed.
const DEFERRED_CLASS_OVERRIDES = {
  notifications: ["notif", "notif-h", "notif-b", "nrow"],
  search: ["srch-in", "srch-res", "sgroup", "sres"],
};
const overrideScreenByClass = new Map();
for (const [screen, classes] of Object.entries(DEFERRED_CLASS_OVERRIDES)) {
  for (const c of classes) overrideScreenByClass.set(c, screen);
}

// Most calendar/analytics/visibility content is never in the static
// markup at all — it's built by a render function as a template string
// (renderCal, renderAn, renderVis and their helpers). A bare "last section
// marker wins" scan would misattribute all of it to whichever `<section
// id="v-...">` happens to come last before <script> (v-settings). Instead,
// every top-level `function name(...)` becomes its own boundary, tagged
// with a screen when the name is on one of these curated, high-confidence
// lists (identified by reading the function bodies and their position
// relative to the calendar-table/analytics/visibility CSS sections — not
// guessed from the name alone) and "script-other" otherwise. "script-other"
// is deliberately neutral (see classifySelector) rather than treated as a
// built screen, so an uncurated function contributes no reachable/deferred
// signal instead of defaulting to falsely reachable.
const CALENDAR_FUNCTIONS = new Set([
  "copyCell", "liveCopy", "orderCols", "moveCol", "renameCol", "addCustomCol",
  "dropCustomCol", "cxVal", "setCx", "renderCx", "editCx", "editCell", "readEdits",
  "calEvents", "fillFilters", "evHTML", "showPreview", "hidePreview", "draftRow",
  "visCols", "tableRows", "stickyLefts", "renderTable", "placeSticky",
  "lockWrapWidth", "colKeyOf", "recFor", "startEdit", "startDraft", "endEdit",
  "isLiveNamed", "openAddCol", "colMenu", "builtinType", "builtinValue",
  "bindColDrag", "bindColTools", "bindPan", "ensureDropline", "wrapScrollZone",
  "cpCancel", "cpHideSoon", "cpShow", "initCopyPop", "bindCopyPop", "bindGrips",
  "applyWidths", "renderList", "renderWeek", "renderCal", "showDay", "bindEv",
  "baseline", "restoreBaseline", "saveAsNew", "markDirty", "clearDirty",
  "snapshot", "switchView", "renderViewBar", "askViewName", "renderColPicker",
]);
const ANALYTICS_FUNCTIONS = new Set(["renderAn", "chart"]);
const VISIBILITY_FUNCTIONS = new Set(["renderVis"]);

// Boundary scan and class-usage search both run over the markup+script
// portion of the file ONLY — never the <style> block itself. Every class
// selector's own CSS declaration naturally contains its own name as text
// (`.calmonth{...}`), and that block sits before every markup/script
// boundary; searching the full file would make every single class token
// match inside the leading "shell" region via its own CSS definition,
// making everything look built regardless of actual usage.
const postStyleOffset = styleMatch.index + styleMatch[0].length;
const postStyleHtml = prototypeHtml.slice(postStyleOffset);

const boundaries = [{ offset: 0, screen: "shell" }];
{
  const sectionRe = /<section[^>]*\bid="v-([a-z]+)"/g;
  let m;
  while ((m = sectionRe.exec(postStyleHtml))) {
    const screen = VIEW_ID_TO_SCREEN[m[1]] || `unknown-view:${m[1]}`;
    boundaries.push({ offset: m.index, screen });
  }
  const scrimIdx = postStyleHtml.indexOf('<div class="scrim"');
  if (scrimIdx !== -1) boundaries.push({ offset: scrimIdx, screen: "modal" });
  const scriptIdx = postStyleHtml.indexOf("<script>");
  if (scriptIdx !== -1) boundaries.push({ offset: scriptIdx, screen: "script-other" });

  const fnRe = /^function\s+([A-Za-z0-9_]+)\s*\(/gm;
  while ((m = fnRe.exec(postStyleHtml))) {
    const name = m[1];
    const screen = CALENDAR_FUNCTIONS.has(name)
      ? "calendar"
      : ANALYTICS_FUNCTIONS.has(name)
        ? "analytics"
        : VISIBILITY_FUNCTIONS.has(name)
          ? "visibility"
          : "script-other";
    boundaries.push({ offset: m.index, screen });
  }
  boundaries.sort((a, b) => a.offset - b.offset);
}

function screenAtOffset(offset) {
  let screen = "shell";
  for (const b of boundaries) {
    if (b.offset <= offset) screen = b.screen;
    else break;
  }
  return screen;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const classTokenCache = new Map();
function screensForClassToken(token) {
  if (classTokenCache.has(token)) return classTokenCache.get(token);
  const re = new RegExp(`(?<![\\w-])${escapeRegex(token)}(?![\\w-])`, "g");
  const screens = new Set();
  let m;
  while ((m = re.exec(postStyleHtml))) {
    screens.add(screenAtOffset(m.index));
  }
  if (overrideScreenByClass.has(token)) screens.add(overrideScreenByClass.get(token));
  classTokenCache.set(token, screens);
  return screens;
}

// A selector can be compound (`.crow.head`) or a bare element/attribute
// selector (`select`, `body`, `*`). We classify by its class tokens; a
// selector with no class token at all is treated as global/shell (it can't
// be screen-specific).
function classifySelector(rawSelector) {
  const classTokens = [...rawSelector.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((m) => m[1]);
  if (classTokens.length === 0) {
    return { reachable: true, screens: new Set(["shell"]), confidence: "global-no-class" };
  }
  const allScreens = new Set();
  for (const t of classTokens) for (const s of screensForClassToken(t)) allScreens.add(s);

  if (allScreens.size === 0) {
    return { reachable: true, screens: allScreens, confidence: "unclassified-no-usage-found" };
  }
  // "script-other" and "unknown-view:*" carry no reachable/deferred signal
  // on their own — an uncurated function contributes nothing rather than
  // defaulting to "built", which would silently swallow real deferred gaps.
  const hasBuilt = [...allScreens].some((s) => BUILT_SCREENS.has(s) || s === "modal");
  const hasDeferred = [...allScreens].some((s) => DEFERRED_SCREENS.has(s));
  if (hasBuilt) {
    return { reachable: true, screens: allScreens, confidence: hasDeferred ? "shared-built-and-deferred" : "built" };
  }
  if (hasDeferred) {
    return { reachable: false, screens: allScreens, confidence: "deferred-only" };
  }
  return { reachable: true, screens: allScreens, confidence: "unclassified-unknown-view" };
}

// ---------------------------------------------------------------------------
// 4. Bucket every prototype selector, and separately every app-only one.
// ---------------------------------------------------------------------------

const buckets = {
  matched: [],
  drifted: [],
  missingReachable: [],
  deferredNoSurface: [],
  appOnly: [],
};

for (const [key, entry] of proto.map) {
  const appEntry = app.map.get(key);
  const classification = classifySelector(entry.rawSelector);
  if (!appEntry) {
    const row = { key, ...entry, ...classification };
    if (classification.reachable) buckets.missingReachable.push(row);
    else buckets.deferredNoSurface.push(row);
    continue;
  }
  if (appEntry.fingerprint === entry.fingerprint) {
    buckets.matched.push({ key, ...entry });
  } else {
    buckets.drifted.push({
      key,
      ...entry,
      appRawBody: appEntry.rawBody,
      ...classification,
    });
  }
}

// App-only comment lookup: find the comment immediately preceding each
// app-only rule in the raw (unstripped) globals.css text, for the report.
function precedingComment(rawCss, selectorText) {
  // Find the first literal occurrence of the selector text in the raw file
  // (best-effort — good enough for a single human-authored file with no
  // duplicate selector text blocks).
  const idx = rawCss.indexOf(selectorText);
  if (idx === -1) return null;
  const before = rawCss.slice(0, idx);
  const commentMatches = [...before.matchAll(/\/\*([\s\S]*?)\*\//g)];
  if (commentMatches.length === 0) return null;
  const last = commentMatches[commentMatches.length - 1];
  // Only attribute the comment if nothing but whitespace sits between it
  // and the selector — otherwise it belongs to an earlier, unrelated rule.
  const gap = rawCss.slice(last.index + last[0].length, idx);
  if (!/^\s*$/.test(gap)) return null;
  return last[1].trim().replace(/\s+/g, " ");
}

for (const [key, entry] of app.map) {
  if (!proto.map.has(key)) {
    buckets.appOnly.push({ key, ...entry, comment: precedingComment(appCss, entry.rawSelector) });
  }
}

// ---------------------------------------------------------------------------
// 5. Size-difference accounting (amendment 3)
// ---------------------------------------------------------------------------

const protoLines = prototypeCss.split("\n").length;
const appLines = appCss.split("\n").length;
const protoSelectorCount = proto.map.size;
const appSelectorCount = app.map.size;

let sharedDeclCount = 0;
for (const row of buckets.matched) sharedDeclCount += row.fingerprint ? row.fingerprint.split(";").length : 0;
for (const row of buckets.drifted) sharedDeclCount += row.fingerprint ? row.fingerprint.split(";").length : 0;
let appOnlyDeclCount = 0;
for (const row of buckets.appOnly) appOnlyDeclCount += row.fingerprint ? row.fingerprint.split(";").length : 0;

// ---------------------------------------------------------------------------
// 5.5. App code (JSX/TSX) inventory — third input. No AST parser (no new
//    dependency) — plain regex over source text, same spirit as the CSS
//    parser above. This is necessarily a heuristic, not a guarantee: a
//    className built from a variable this script can't trace back to a
//    literal is invisible to it. Where that happens it's surfaced as an
//    "unresolved" reference rather than silently skipped.
// ---------------------------------------------------------------------------

function walkFiles(dir, exts, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const codeFiles = ["app", "components"].flatMap((d) =>
  walkFiles(path.join(ROOT, d), [".tsx", ".jsx"]),
);

// token -> { confidence: "static" | "computed", files: Set<relPath> }
const appCodeClassTokens = new Map();
const ariaUsage = {
  "aria-pressed": new Set(),
  "aria-current": new Set(),
  "aria-selected": new Set(),
};
const unresolvedClassNameRefs = []; // { identifier, file }

function recordToken(raw, confidence, relFile) {
  const token = raw.trim();
  if (!token) return;
  let entry = appCodeClassTokens.get(token);
  if (!entry) {
    entry = { confidence, files: new Set() };
    appCodeClassTokens.set(token, entry);
  } else if (confidence === "static") {
    entry.confidence = "static"; // a static hit anywhere upgrades it
  }
  entry.files.add(relFile);
}

for (const file of codeFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const src = readFileSync(file, "utf8");

  for (const m of src.matchAll(/className\s*=\s*"([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) recordToken(t, "static", rel);
  }
  for (const m of src.matchAll(/className\s*=\s*'([^']*)'/g)) {
    for (const t of m[1].split(/\s+/)) recordToken(t, "static", rel);
  }
  for (const m of src.matchAll(/className\s*=\s*\{\s*`([\s\S]*?)`\s*\}/g)) {
    const tmpl = m[1];
    // Static quasis (the literal text between `${...}` interpolations).
    for (const part of tmpl.split(/\$\{[\s\S]*?\}/)) {
      for (const t of part.split(/\s+/)) recordToken(t, "static", rel);
    }
    // Any quoted string literal inside an interpolation (e.g. the "over" /
    // "has-file" branches of a ternary) — the class is real, but which
    // branch is live depends on runtime state, so it's low-confidence.
    for (const expr of tmpl.matchAll(/\$\{([\s\S]*?)\}/g)) {
      const literals = [...expr[1].matchAll(/["']([^"']+)["']/g)];
      for (const sm of literals) {
        for (const t of sm[1].split(/\s+/)) recordToken(t, "computed", rel);
      }
      // No string literal at all inside the interpolation (e.g. `${f.tone}`
      // where tone is a variable) — genuinely opaque to a regex scan, and
      // unlike the whole-expression `className={var}` case above, this one
      // sits inside a template so it would otherwise fail silently instead
      // of being flagged. Record it so List B doesn't call something "dead"
      // when it's actually driven by a value this scan can't see.
      if (literals.length === 0) {
        unresolvedClassNameRefs.push({ identifier: `\${${expr[1].trim().slice(0, 40)}}`, file: rel });
      }
    }
  }
  // className={someVariable} — try to resolve it back to a local `const`
  // whose right-hand side is a plain string or ternary of string literals
  // in the same file; otherwise it's genuinely opaque to a regex scan.
  for (const m of src.matchAll(/className\s*=\s*\{\s*([A-Za-z_$][\w]*)\s*\}/g)) {
    const varName = m[1];
    const declMatch = src.match(new RegExp(`const\\s+${varName}\\s*=\\s*([^;\\n]+)`));
    if (!declMatch) {
      unresolvedClassNameRefs.push({ identifier: varName, file: rel });
      continue;
    }
    const literals = [...declMatch[1].matchAll(/["'`]([^"'`]+)["'`]/g)];
    if (literals.length === 0) {
      unresolvedClassNameRefs.push({ identifier: varName, file: rel });
      continue;
    }
    for (const lm of literals) {
      for (const t of lm[1].split(/\s+/)) recordToken(t, "computed", rel);
    }
  }

  for (const attr of Object.keys(ariaUsage)) {
    if (new RegExp(`\\b${attr}=`).test(src)) ariaUsage[attr].add(rel);
  }
}

function classTokensOf(selector) {
  return [...selector.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)].map((m) => m[1]);
}

const protoClassTokens = new Set();
for (const entry of proto.map.values()) for (const t of classTokensOf(entry.rawSelector)) protoClassTokens.add(t);

// token -> array of selector keys in app/globals.css that use it (for List B
// display and for cross-referencing against the App-only bucket's comments).
const appCssTokenToSelectors = new Map();
for (const key of app.map.keys()) {
  const entry = app.map.get(key);
  for (const t of classTokensOf(entry.rawSelector)) {
    (appCssTokenToSelectors.get(t) ?? appCssTokenToSelectors.set(t, []).get(t)).push(key);
  }
}
const appOnlyKeySet = new Set(buckets.appOnly.map((r) => r.key));
const appOnlyCommentByKey = new Map(buckets.appOnly.map((r) => [r.key, r.comment]));

// List A — referenced in app code, no rule anywhere in app/globals.css.
const listA = [];
for (const [token, info] of appCodeClassTokens) {
  if (!appCssTokenToSelectors.has(token)) {
    listA.push({ token, ...info });
  }
}
listA.sort((a, b) => a.token.localeCompare(b.token));

// List B — a rule in app/globals.css uses this class token, but no app code
// file references it at all.
const listB = [];
for (const [token, selectors] of appCssTokenToSelectors) {
  if (!appCodeClassTokens.has(token)) {
    const documentedSelectors = selectors.filter((k) => appOnlyKeySet.has(k));
    listB.push({
      token,
      selectors,
      comment: documentedSelectors.length ? appOnlyCommentByKey.get(documentedSelectors[0]) : null,
      isAppOnly: documentedSelectors.length > 0,
    });
  }
}
listB.sort((a, b) => a.token.localeCompare(b.token));

// List C — in the prototype, and touched by neither app/globals.css nor app
// code. Explicitly not Phase 2 work regardless of which of the five buckets
// (Missing-reachable or Deferred) each token's selectors landed in.
const listC = [...protoClassTokens]
  .filter((t) => !appCssTokenToSelectors.has(t) && !appCodeClassTokens.has(t))
  .sort();

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------

const deferredByScreen = {};
for (const row of buckets.deferredNoSurface) {
  for (const s of row.screens) {
    if (!DEFERRED_SCREENS.has(s)) continue;
    (deferredByScreen[s] ??= []).push(row.key);
  }
}

const reachableByScreen = {};
for (const row of buckets.missingReachable) {
  // Same label set used for the reachable/deferred decision itself (built
  // screens, "modal", "shell") — kept consistent with `confidence` so this
  // grouping and the summary count of "unclassified" items agree with each
  // other instead of using two different definitions of "unclassified".
  const named = [...row.screens].filter((s) => BUILT_SCREENS.has(s) || s === "modal");
  const label = named.length ? named.join(",") : "unclassified";
  (reachableByScreen[label] ??= []).push(row);
}

let md = "";
md += "# CSS coverage audit — prototype vs app/globals.css\n\n";
md += `Generated by \`scripts/css-coverage.mjs\`. Prototype \`<style>\` block: lines ${styleBlockStartLine}-${styleBlockEndLine} of \`project-details/frank-prototype.html\`. Neither input file was modified to produce this report.\n\n`;

md += "## Size accounting\n\n";
md += "| | Prototype `<style>` | app/globals.css |\n|---|---|---|\n";
md += `| Lines | ${protoLines} | ${appLines} |\n`;
md += `| Individual selectors (grouped selectors split) | ${protoSelectorCount} | ${appSelectorCount} |\n`;
md += `| Declaration blocks (rules, pre-split) | ${proto.ruleCount} | ${app.ruleCount} |\n`;
md += `| Total property declarations | ${proto.declCount} | ${app.declCount} |\n\n`;
md += `Declarations shared between the two files (Matched + Drifted selectors, by the app's copy): **${sharedDeclCount}**. Declarations that exist only in the app (App-only bucket): **${appOnlyDeclCount}**. The remainder of the ${appLines - protoLines}-line gap is one-declaration-per-line pretty-printing of a file that ships minified — the prototype packs many declarations per source line; the app does not.\n\n`;

md += "## Bucket counts\n\n";
md += "| Bucket | Count |\n|---|---|\n";
md += `| Matched | ${buckets.matched.length} |\n`;
md += `| Drifted | ${buckets.drifted.length} |\n`;
md += `| Missing, reachable | ${buckets.missingReachable.length} |\n`;
md += `| Deferred, no surface | ${buckets.deferredNoSurface.length} |\n`;
md += `| App-only | ${buckets.appOnly.length} |\n\n`;

const unclassified = buckets.missingReachable.filter((r) =>
  r.confidence.startsWith("unclassified"),
);
md += `Of the ${buckets.missingReachable.length} "Missing, reachable" selectors, ${unclassified.length} could not be pinned to a specific built screen (usage not found by the class-token scan, or found only in an unrecognised context) and default to reachable per the safe-default policy — see the confidence column. These need a human look, not automated bucketing.\n\n`;

md += "## App code cross-reference (third input)\n\n";
md += `Scanned ${codeFiles.length} \`.tsx\`/\`.jsx\` files under \`app/\` and \`components/\` for \`className\` usage (static strings, template literals, and local \`const\` variables resolvable back to string literals) and for \`aria-pressed\`/\`aria-current\`/\`aria-selected\` attributes. ${unresolvedClassNameRefs.length} \`className={variable}\` expressions could not be resolved to any literal at all and are listed separately below — this scan cannot see inside them, so a real class name could be hiding in one.\n\n`;
md += "| Attribute | Used in |\n|---|---|\n";
for (const attr of Object.keys(ariaUsage)) {
  md += `| \`${attr}\` | ${ariaUsage[attr].size ? [...ariaUsage[attr]].map((f) => `\`${f}\``).join(", ") : "_nowhere_"} |\n`;
}
md += "\n";

md += "### List A — referenced in app code, no rule in globals.css\n\n";
md += "This is the live bug list: a component asks for a visual state that doesn't exist in the stylesheet at all. It supersedes the 765/356 Missing-reachable split from the first pass — that split was prototype-selector-first (\"does the prototype's rule exist anywhere in the app\"); this is app-code-first (\"does what the app actually renders have anything to style it\"), which is the question that matters for a live bug list.\n\n";
if (listA.length === 0) {
  md += "_None._\n\n";
} else {
  for (const row of listA) {
    md += `- \`.${row.token}\`${row.confidence === "computed" ? " _(computed/template-literal — low confidence)_" : ""} — ${[...row.files].map((f) => `\`${f}\``).join(", ")}\n`;
  }
  md += "\n";
}
if (unresolvedClassNameRefs.length) {
  md += "**Unresolved `className={variable}` expressions** (needs a human read, not covered by List A above):\n\n";
  for (const r of unresolvedClassNameRefs) md += `- \`${r.identifier}\` in \`${r.file}\`\n`;
  md += "\n";
}

md += "### List B — rule in globals.css, referenced nowhere in app code\n\n";
md += "Dead or scaffolding. Cross-referenced against the 80 App-only rules from the first pass: where a documenting comment exists, it's shown — that's very likely deliberate and should stay. Where there's no comment, it's either a stand-in nobody annotated or a genuinely-ported prototype rule whose consumer was since removed from the app; both need a human decision, not an automatic deletion. A token that's really only reachable through one of the unresolved expressions just above (e.g. a class name assembled from a variant/tone variable) will show up here as a false positive — cross-check against that list before deleting anything.\n\n";
for (const row of listB) {
  md += `- \`.${row.token}\`${row.comment ? ` — _${row.comment}_ (documented app-only)` : row.isAppOnly ? " _(app-only, undocumented)_" : " _(ported from prototype, unused in app code)_"}\n`;
}
md += "\n";

md += "### List C — in the prototype, referenced nowhere, no rule\n\n";
md += `${listC.length} class tokens. Not Phase 2 work regardless of which bucket (Missing-reachable or Deferred) their selectors landed in above — full list omitted here for length, it's the residual of tokens neither ported nor used anywhere in app code.\n\n`;

md += "## Deferred, no surface — by screen\n\n";
md += "These selectors belong to calendar, analytics, visibility, notifications or the command-K search overlay — none of which have a route or a hook yet. Not Phase 2/3 work; recorded here as the allowlist a future `npm run parity` coverage gate should seed from.\n\n";
for (const screen of Object.keys(deferredByScreen).sort()) {
  md += `**${screen}** (${deferredByScreen[screen].length}): ${deferredByScreen[screen].map((k) => `\`${k}\``).join(", ")}\n\n`;
}

md += "## Drifted — selector present in both, declarations differ\n\n";
for (const row of buckets.drifted) {
  md += `### \`${row.key}\`\n\n`;
  md += `Screens: ${[...row.screens].join(", ") || "—"}\n\n`;
  md += "Prototype:\n```css\n" + row.rawBody.trim() + "\n```\n\n";
  md += "App:\n```css\n" + row.appRawBody.trim() + "\n```\n\n";
}

md += "## Missing, reachable — full list, grouped by screen\n\n";
for (const [screens, rows] of Object.entries(reachableByScreen)) {
  md += `### ${screens} (${rows.length})\n\n`;
  for (const row of rows) {
    md += `- \`${row.key}\`${row.confidence.startsWith("unclassified") ? " _(unclassified — needs manual check)_" : ""}\n`;
  }
  md += "\n";
}

md += "## App-only — in app/globals.css, not in the prototype\n\n";
md += "Not necessarily a problem — some of this is documented, deliberate scaffolding for features the prototype fakes with static demo data (drag-state, etc). Listed with whatever comment precedes it in the file, so Phase 2 can see which are real stand-ins to keep and which should be replaced once the real prototype-equivalent CSS is ported.\n\n";
for (const row of buckets.appOnly) {
  md += `- \`${row.key}\`${row.comment ? ` — _${row.comment}_` : ""}\n`;
}
md += "\n";

writeFileSync(OUT_PATH, md, "utf8");

console.log("Bucket counts:");
console.log("  Matched:            ", buckets.matched.length);
console.log("  Drifted:            ", buckets.drifted.length);
console.log("  Missing, reachable: ", buckets.missingReachable.length);
console.log("  Deferred, no surface:", buckets.deferredNoSurface.length);
console.log("  App-only:           ", buckets.appOnly.length);
console.log();
console.log("Written to", path.relative(ROOT, OUT_PATH));
