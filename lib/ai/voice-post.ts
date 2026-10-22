// A post made or changed by speaking (direct instruction): what was said,
// turned into the post window's fields by one AI request, for the person
// to check before Create Post or Update. Nothing here saves anything.

export interface VoicePostInput {
  transcript: string;
  // Their own today, so "the 20th" or "next Friday" lands right.
  today: string; // YYYY-MM-DD
  weekday: string; // "Saturday"
  delivery: "scheduled" | "continuous";
  formats: { id: string; label: string }[];
  team: { id: string; name: string }[];
  // An existing post's brief as the window has it (direct instruction:
  // speaking works on a post already made, too), so only what's said
  // changes.
  current?: VoicePostCurrent;
}

export interface VoicePostCurrent {
  name: string;
  formats: string[];
  slideCount: number | null;
  date: string; // YYYY-MM-DD or ""
  time: string; // HH:MM or ""
  dueOn: string; // YYYY-MM-DD or ""
  concept: string;
  referenceUrls: string[];
  teamUserIds: string[];
}

export interface VoicePostFields {
  name?: string;
  formats?: string[];
  slideCount?: number;
  date?: string; // YYYY-MM-DD, a scheduled post's Publish Date
  time?: string; // HH:MM
  dueOn?: string; // YYYY-MM-DD, a continuous post's Live Date
  concept?: string;
  referenceUrls?: string[];
  teamUserIds?: string[];
}

export function buildVoicePostPrompt(input: VoicePostInput): string {
  const scheduled = input.delivery === "scheduled";
  const cur = input.current;
  return [
    "You turn what someone said aloud about a social media post into the fields of a form. Reply with one JSON object and nothing else.",
    "",
    `Today is ${input.weekday} ${input.today}. Dates they say are on or after today unless they clearly mean otherwise.`,
    "",
    "Fields (leave any out that they didn't say or clearly imply):",
    cur
      ? '- "name": only if they rename it, 2 to 6 words.'
      : '- "name": a short post name, 2 to 6 words. If they didn\'t name it, make one from what it\'s about.',
    '- "formats": format ids from the list below, the main one first. "Instagram post" means ig_feed, "reel" ig_reel, "carousel" ig_carousel, "story" ig_story, unless they name another platform.',
    '- "slideCount": how many slides or stories, a number, only for carousels and stories.',
    scheduled
      ? '- "date": the Publish Date, YYYY-MM-DD. "time": its time, 24-hour HH:MM.'
      : '- "dueOn": the Live Date, YYYY-MM-DD.',
    cur
      ? '- "concept": only if they talk about what the post is or how it should look: the whole updated concept, keeping what\'s there and working in what they said (replace it only if they say to), tidied into one to four sentences. Don\'t invent details they didn\'t give.'
      : '- "concept": what the post is and how it should look, in their words, tidied into a clear brief of one to four sentences. Don\'t invent details they didn\'t give.',
    '- "referenceUrls": any links they read out, as URLs.',
    '- "teamUserIds": ids from the team list below for the people they name, matching first names or nicknames.',
    "",
    ...(cur
      ? [
          "This post already exists. Change only what they talk about and leave every other field out. For formats, references and team, give the whole list after their change (\"add Hannah\" keeps who's there).",
          "",
          "The post now:",
          `name: ${cur.name || "(none)"}`,
          `formats: ${cur.formats.join(", ") || "(none)"}`,
          ...(cur.slideCount ? [`slideCount: ${cur.slideCount}`] : []),
          scheduled ? `date: ${cur.date || "(none)"}, time: ${cur.time || "(none)"}` : `dueOn: ${cur.dueOn || "(none)"}`,
          `concept: ${cur.concept.trim() || "(none)"}`,
          `referenceUrls: ${cur.referenceUrls.join(" ") || "(none)"}`,
          `teamUserIds: ${cur.teamUserIds.join(", ") || "(none)"}`,
          "",
        ]
      : []),
    "Formats:",
    ...input.formats.map((f) => `${f.id}: ${f.label}`),
    "",
    "Team:",
    ...(input.team.length ? input.team.map((t) => `${t.id}: ${t.name}`) : ["(none)"]),
    "",
    "What they said:",
    `"""${input.transcript.trim()}"""`,
  ].join("\n");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// The reply's fields, kept only where they're real: known formats and team
// members, well-formed dates and times, plain strings. Anything else is
// dropped rather than trusted.
export function parseVoicePost(
  text: string,
  allowed: { formatIds: Set<string>; teamIds: Set<string> },
): VoicePostFields {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const out: VoicePostFields = {};
  const name = str(raw.name);
  if (name) out.name = name.slice(0, 120);
  if (Array.isArray(raw.formats)) {
    const formats = [...new Set(raw.formats.filter((f): f is string => typeof f === "string" && allowed.formatIds.has(f)))];
    if (formats.length) out.formats = formats;
  }
  if (typeof raw.slideCount === "number" && Number.isInteger(raw.slideCount) && raw.slideCount >= 1 && raw.slideCount <= 20) {
    out.slideCount = raw.slideCount;
  }
  const date = str(raw.date);
  if (date && DATE.test(date)) out.date = date;
  const time = str(raw.time);
  if (time && TIME.test(time)) out.time = time;
  const dueOn = str(raw.dueOn);
  if (dueOn && DATE.test(dueOn)) out.dueOn = dueOn;
  const concept = str(raw.concept);
  if (concept) out.concept = concept.slice(0, 4000);
  if (Array.isArray(raw.referenceUrls)) {
    const urls = raw.referenceUrls.map(str).filter((u): u is string => !!u).slice(0, 10);
    if (urls.length) out.referenceUrls = urls;
  }
  if (Array.isArray(raw.teamUserIds)) {
    const team = [...new Set(raw.teamUserIds.filter((t): t is string => typeof t === "string" && allowed.teamIds.has(t)))];
    if (team.length) out.teamUserIds = team;
  }
  return out;
}
