// Frank's tips (direct instruction): a card top right for 5 seconds, for
// the team only, each drawn from a Help article. See it in Action takes you
// to the feature, where it lights up (TipSpotlight); Read More opens its
// article. How often is each person's own setting (phase116). Keep each
// tip true to its article; a new feature can bring a new tip.

export type TipPlace =
  // A project's New Post window: the one you're in, or your latest planner.
  | "new-post"
  // Your most recent post, its Edit window at Content.
  | "post-content"
  // A project's table, with a quick-add row open.
  | "new-row"
  // A project's table.
  | "table"
  // Where you are.
  | "here";

export interface Tip {
  id: string;
  title: string;
  text: string;
  // Its Help article (lib/help-content.ts), for Read More.
  articleId: string;
  place: TipPlace;
  // What lights up once there, the first that's on screen.
  spot: string[];
}

export const TIPS: Tip[] = [
  {
    id: "design-with-frank",
    title: "Design with Frank",
    text: "Write the Concept, then Frank offers a direction for the design, or reworks your Notes for Designer with you.",
    articleId: "design-with-frank",
    place: "new-post",
    spot: ['[data-tip="design-with-frank"]'],
  },
  {
    id: "speak-it",
    title: "Speak It",
    text: "Say what the post is, when it goes out and who's on it, and Frank fills in the Brief.",
    articleId: "plan-posts",
    place: "new-post",
    spot: ['[data-tip="speak-it"]'],
  },
  {
    id: "draft-with-frank",
    title: "Draft with Frank",
    text: "Drafts of the caption from the brief, in the client's voice. Production has its own, for the VO and Text on Image.",
    articleId: "write-with-claude",
    place: "post-content",
    spot: ['[data-tip="draft-with-frank"]'],
  },
  {
    id: "approve-concept",
    title: "Approve the Concept",
    text: "A post stays in Concept until it's approved: by your team, or the client, with one click.",
    articleId: "comments",
    place: "table",
    // A post waiting for approval, else the column it's in, else (an empty
    // month) the stages under the table.
    spot: [".tpending-btn.approve", 'th[data-col-key="concept"]', 'th[data-col-key="conceptRef"]', ".callegend"],
  },
  {
    id: "notes-for-designer",
    title: "Notes for Designer",
    text: "Tell the designer what you see, overall and slide by slide. Only your team sees them.",
    articleId: "plan-posts",
    place: "new-post",
    spot: ["#nbNotes"],
  },
  {
    id: "reference-images",
    title: "Paste a Reference Image",
    text: "Copy an image from anywhere and paste it under References, for the designer and Design with Frank.",
    articleId: "plan-posts",
    place: "new-post",
    spot: [".refimg-drop"],
  },
  {
    id: "add-by-row",
    title: "Add a Post by Row",
    text: "Type a post straight into the table: its name, date, copy and notes, without the window.",
    articleId: "plan-posts",
    place: "new-row",
    spot: ["tr.draft"],
  },
  {
    id: "search",
    title: "Search with ⌘K",
    text: "Jump to any client, project or page from anywhere: press ⌘K (Ctrl K on Windows).",
    articleId: "search",
    place: "here",
    spot: [".gsearch .search"],
  },
];

export const tipById = (id: string) => TIPS.find((t) => t.id === id) ?? null;

// How often, as each person picks it (phase116): hours between tips, 24
// being once a day and 0 off.
export const TIP_EVERY_OPTIONS: { hours: number; label: string }[] = [
  { hours: 24, label: "Once a day" },
  { hours: 4, label: "Every 4 hours" },
  { hours: 3, label: "Every 3 hours" },
  { hours: 2, label: "Every 2 hours" },
  { hours: 1, label: "Every hour" },
  { hours: 0, label: "Off" },
];

// Whether it's time for a tip: once a day is the first time Frank is open
// on a new day (their own day); otherwise once the hours have passed.
export function tipDue(everyHours: number, lastAt: string | null, now: Date): boolean {
  if (everyHours <= 0) return false;
  if (!lastAt) return true;
  const last = new Date(lastAt);
  if (Number.isNaN(last.getTime())) return true;
  if (everyHours >= 24) return last.toDateString() !== now.toDateString();
  return now.getTime() - last.getTime() >= everyHours * 3_600_000;
}

// The next tip they haven't seen, in order; none once they've seen them all.
export function nextTip(seen: string[]): Tip | null {
  const done = new Set(seen);
  return TIPS.find((t) => !done.has(t.id)) ?? null;
}
