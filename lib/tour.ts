import type { AgencyRole } from "@/lib/roles";

// Frank Tour (phase144, direct instruction): a short guided look at the
// basics, the page dimmed around one thing at a time, Next to move on. A
// tour per kind of person: Owners and Admins set up, Users do the work,
// clients review it. Shown once on someone's first visit, and replayable
// from Frank Tour in the account menu.

export type TourKind = "admin" | "user" | "client";

// Where a step is shown: the page it needs, or wherever the person is.
export type TourPlace =
  | "here"
  | "dashboard"
  | "client"
  | "client-settings"
  | "client-knowledge"
  | "client-instagram"
  | "client-preferences"
  | "project"
  | "assets"
  | "post"
  | "team"
  | "analytics"
  | "settings";

export interface TourStep {
  id: string;
  place: TourPlace;
  // What to light up, the first found; none for a card in the middle. A
  // selector can be "text=<css>|<words>": the first <css> whose text
  // starts with <words>.
  spot?: string[];
  // Clicked, in turn, before looking for the spot: a window opened to show
  // what's in it (Show Me, phase147). Only ever opening: the tour never
  // saves or changes anything. Closed again when the next step doesn't
  // need it.
  open?: string[];
  // Only for someone who can invite people (Owners, and Admins let to).
  invites?: boolean;
  // Which of the sample's posts a "post" step shows (phase146): one in
  // Internal Review with artwork, one in Client Review with a comment, or
  // one waiting for its concept to be approved. The stages one by default.
  post?: "stages" | "comments" | "concept";
  title: string;
  body: string;
}

const WELCOME_ADMIN: TourStep = {
  id: "welcome",
  place: "here",
  title: "Welcome to Frank",
  body: "A quick look at getting set up: your workspace, a client, a project and its posts. It takes about a minute.",
};

const END: TourStep = {
  id: "end",
  place: "here",
  title: "You're all set",
  body: "Replay this any time from Frank Tour in your menu. Ask Frank, the ? at the top, has the rest, and answers your questions.",
};

const MENU: TourStep = {
  id: "menu",
  place: "here",
  spot: ['button[aria-label="Your account"]'],
  title: "Your menu",
  body: "Your profile and notifications are here, and Frank Tour to replay this.",
};

const BELL: TourStep = {
  id: "bell",
  place: "here",
  spot: ['.topbar button[title="Notifications"]'],
  title: "Notifications",
  body: "Mentions, replies and approvals land here, so you know what needs you.",
};

export const TOURS: Record<TourKind, TourStep[]> = {
  admin: [
    WELCOME_ADMIN,
    {
      ...MENU,
      title: "Your workspace",
      body: "Workspace Settings are in your menu: your logo and colours, your team, statuses and plan. Frank Tour is here too, to replay this.",
    },
    {
      id: "new-client",
      place: "dashboard",
      spot: ['[data-tour="new-client"]'],
      title: "Add a client",
      body: "Each brand you work for is a client. Add one here and it gets its own projects, knowledge and settings.",
    },
    {
      id: "new-project",
      place: "client",
      spot: ['[data-tour="new-project"]'],
      title: "Create a project",
      body: "A Project holds one-off pieces such as ads, listings or emailers. A Content Planner schedules posts by date, with week and calendar views.",
    },
    {
      id: "new-post",
      place: "project",
      spot: ['.split:has(button[aria-label="New Post"])'],
      title: "Add a post",
      body: "Add a post in its own window, or straight into the table as a row.",
    },
    {
      id: "stages",
      place: "post",
      spot: [".stagesw"],
      title: "From concept to live",
      body: "Each post moves through these stages. In Client Review, Share sends your client a link to comment and approve, with no login needed.",
    },
    {
      id: "invite",
      place: "team",
      invites: true,
      spot: ['[data-tour="invite"]'],
      title: "Invite your team",
      body: "Invite colleagues and choose their roles. Admins see every client; Users see the clients you pick for them.",
    },
    END,
  ],
  user: [
    {
      ...WELCOME_ADMIN,
      body: "A quick look at the basics: your clients, a project's posts, and how a post moves to approval.",
    },
    {
      id: "clients",
      place: "dashboard",
      // The list, or where it says there's nothing yet.
      spot: ['[data-tour="clients"]', ".view .empty", ".empty"],
      title: "Your clients",
      body: "The clients you work on. Open one to see its projects.",
    },
    {
      id: "table",
      place: "project",
      // The table, or where it says nothing is scheduled in this view.
      spot: [".tbl", ".empty"],
      title: "A project's posts",
      body: "Every post in the project, with its date, status, copy and artwork. Open a row to see the post, or use a cell's Edit to change just that.",
    },
    {
      id: "stages",
      place: "post",
      spot: [".stagesw"],
      title: "Stages",
      body: "Each post moves through these: Concept, Production, Internal, Client, Approved and Live.",
    },
    {
      id: "edit",
      place: "post",
      spot: ['[data-tour="edit"]'],
      title: "Edit a post",
      body: "Edit opens the post's window: write the copy, upload artwork, and let Draft with Frank write or clean up a draft.",
    },
    {
      id: "comments",
      place: "post",
      post: "comments",
      spot: [".composer"],
      title: "Comments",
      body: "Leave feedback here. Private keeps a comment within your team. Select the post's text, or click its artwork, to comment on that spot.",
    },
    BELL,
    MENU,
    END,
  ],
  client: [
    {
      ...WELCOME_ADMIN,
      body: "Here's how to review your agency's work: find a post, comment on it, and approve it.",
    },
    {
      id: "clients",
      place: "dashboard",
      // The list, or where it says there's nothing yet.
      spot: ['[data-tour="clients"]', ".view .empty", ".empty"],
      title: "Your work",
      body: "Everything your agency is making for you. Open it to see its projects and posts.",
    },
    {
      id: "phone",
      place: "post",
      spot: [".phoneframe", ".stage .canvas"],
      title: "The post",
      body: "See the post as it will appear. Select its text, or click its artwork, to comment on that exact spot.",
    },
    {
      id: "comments",
      place: "post",
      post: "comments",
      spot: [".composer"],
      title: "Comment and approve",
      body: "Leave feedback here. While a post is a concept, Approve Concept sits beside Post. For the finished post, your agency sends a review link to approve it.",
    },
    BELL,
    END,
  ],
};

// Who gets which tour: Finance has none.
export function tourKind(role: AgencyRole | null | undefined, clientId: string | null | undefined): TourKind | null {
  if (!role) return null;
  if (clientId) return "client";
  if (role === "owner" || role === "primary_owner" || role === "admin") return "admin";
  if (role === "user") return "user";
  return null;
}

// Whether a tour is running, for what should wait meanwhile (tips).
let touring = false;
const listeners = new Set<() => void>();
export function setTouring(on: boolean) {
  if (touring === on) return;
  touring = on;
  listeners.forEach((l) => l());
}
export function subscribeTouring(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function isTouring() {
  return touring;
}

// Frank Tour in the menu starts it with this; Help's Show Me with a topic
// (guide) or a category in its detail.
export const TOUR_START_EVENT = "frank:tour-start";

export interface TourStart {
  guide?: string;
  category?: string;
}

export function startTour(start?: TourStart) {
  window.dispatchEvent(new CustomEvent(TOUR_START_EVENT, { detail: start }));
}

// Set in a browser to keep the tour from starting on its own there (the
// end-to-end tests' accounts are all new); Frank Tour still starts it.
export const TOUR_AUTO_OFF_KEY = "frank:tour-auto-off";

// Help's Show Me (phase147, direct instruction): each topic's own short
// walkthrough, in the tour's look, on the sample client. A category's runs
// its topics' back to back. The team's only; topics with nothing on screen
// to point at (the Frank Mark, signing in, Frank on a phone, working on the
// same post as someone else) have none.
//
// Each starts where a first-timer would (direct instruction): Clients, or
// their menu, then every click on the way, before the topic itself. In a
// spot, {client}, {project}, {assets} and {post:<which>} are the sample's
// own ids.

// The way to a client, a project, a post, a client's settings page, and
// the workspace's settings.
const TO_CLIENT: TourStep[] = [
  {
    id: "go-client",
    place: "dashboard",
    spot: ['.clients [href="/clients/{client}"]', ".clients"],
    title: "Open a client",
    body: "Clients lists everyone you work for. Click a client to open it. Here it's Lumen Skin, your sample client.",
  },
];

const TO_PLANNER: TourStep[] = [
  ...TO_CLIENT,
  {
    id: "go-planner",
    place: "client",
    spot: ['.crow[href="/projects/{project}"]'],
    title: "Open a project",
    body: "A client's projects are listed on its page. Click one to open it. Here, the Launch Month planner.",
  },
];

const TO_ASSETS: TourStep[] = [
  ...TO_CLIENT,
  {
    id: "go-assets",
    place: "client",
    spot: ['.crow[href="/projects/{assets}"]'],
    title: "Open a Project",
    body: "Projects, for one-off pieces, are listed with the client's planners. Here, Launch Assets.",
  },
];

function toPost(post: "stages" | "comments" | "concept", name: string): TourStep[] {
  return [
    ...TO_PLANNER,
    {
      id: `go-post-${post}`,
      place: "project",
      spot: [`tr[data-post="{post:${post}}"]`, ".tbl"],
      title: "Open a post",
      body: `Each row is a post. Click one to open its page. Here, ${name}.`,
    },
  ];
}

function toClientSettings(section: string, page: string): TourStep[] {
  return [
    ...TO_CLIENT,
    {
      id: "go-client-settings",
      place: "client",
      spot: ['.pad button[aria-label$=" Settings"]', '.pad a[aria-label$=" Settings"]'],
      title: "Client Settings",
      body: "The cog, top right of a client's page, opens its settings.",
    },
    {
      id: `go-cs-${page}`,
      place: "client-settings",
      spot: [`text=.setnav a|${page}`, `text=.setnav-h|${section}`],
      title: `${section} → ${page}`,
      body: `In the list on the left, open ${section}, then ${page}.`,
    },
  ];
}

const TO_WORKSPACE_SETTINGS: TourStep[] = [
  {
    id: "go-menu",
    place: "here",
    spot: ['button[aria-label="Your account"]'],
    title: "Your menu",
    body: "Click your picture, top right, for your menu.",
  },
  {
    id: "go-workspace-settings",
    place: "here",
    open: ['button[aria-label="Your account"]'],
    spot: ['text=[role="menuitem"]|Workspace Settings'],
    title: "Workspace Settings",
    body: "Workspace Settings is in it, for Owners and Admins.",
  },
];

function toWorkspacePage(section: string, page: string): TourStep[] {
  return [
    ...TO_WORKSPACE_SETTINGS,
    {
      id: `go-ws-${page}`,
      place: "settings",
      spot: [`text=.setnav a|${page}`, `text=.setnav-h|${section}`],
      title: section === page ? section : `${section} → ${page}`,
      body: section === page ? `In the list on the left, open ${section}.` : `In the list on the left, open ${section}, then ${page}.`,
    },
  ];
}

const COMMENT_POST = { place: "post" as const, post: "comments" as const };

export const GUIDES: Record<string, TourStep[]> = {
  "how-frank-works": [
    ...TO_PLANNER,
    {
      id: "hfw-table",
      place: "project",
      spot: [".tbl", ".empty"],
      title: "Clients, projects and posts",
      body: "Everything sits under a client, and every client has projects. This is a planner's table: each row is a post.",
    },
    {
      id: "go-post-stages",
      place: "project",
      spot: ['tr[data-post="{post:stages}"]', ".tbl"],
      title: "Open a post",
      body: "Click a post to open its page. Here, Morning Routine in 3 Steps.",
    },
    {
      id: "hfw-stages",
      place: "post",
      spot: [".stagesw"],
      title: "Six stages",
      body: "A post moves from Concept to In Production, Internal Review, Client Review, Approved and Live. Its own stage is the coloured pill.",
    },
    {
      id: "hfw-comments",
      place: "post",
      spot: [".cmts"],
      title: "Feedback on the post",
      body: "Your team and your client comment here, on the whole post or on one line of its caption.",
    },
  ],
  search: [
    {
      id: "search-box",
      place: "here",
      spot: ['[aria-label="Search pages, clients and projects"]', ".topbar .search"],
      title: "Find anything fast",
      body: "Click the search box at the top, or press ⌘K (Ctrl K on Windows), and type a client, a project or a page. Type planner to list every Content Planner.",
    },
  ],
  "create-client": [
    {
      id: "cc-new-client",
      place: "dashboard",
      spot: ['[data-tour="new-client"]'],
      title: "Add a client",
      body: "On Clients, New Client asks for the client's name and details. It then gets its own page, projects, knowledge and settings.",
    },
    ...TO_CLIENT,
    {
      id: "cc-new-project",
      place: "client",
      spot: ['[data-tour="new-project"]'],
      title: "Its first project",
      body: "On the client's page, New Project starts a project.",
    },
    {
      id: "cc-kind",
      place: "client",
      open: ['[data-tour="new-project"]'],
      spot: [".kindpick"],
      title: "Project or Content Planner",
      body: "A Project holds one-off pieces by due date. A Content Planner schedules posts by date, with week, month and calendar views.",
    },
  ],
  "client-settings": [
    ...TO_CLIENT,
    {
      id: "go-client-settings",
      place: "client",
      spot: ['.pad button[aria-label$=" Settings"]', '.pad a[aria-label$=" Settings"]'],
      title: "Client Settings",
      body: "The cog, top right of a client's page, opens its settings.",
    },
    {
      id: "cs-nav",
      place: "client-settings",
      spot: [".setnav"],
      title: "Everything about the client",
      body: "Its profile and people, its knowledge and strategy, its preferences for review links and artwork, and its Instagram.",
    },
  ],
  knowledge: [
    ...TO_CLIENT,
    {
      id: "kb-overview",
      place: "client",
      spot: [".brandrem-grid"],
      title: "What Frank knows",
      body: "The Strategy Overview sums up the client's Knowledge. Frank uses it when it drafts and checks copy. See All opens it.",
    },
    ...toClientSettings("Knowledge", "Discovery").slice(1),
    {
      id: "kb-sections",
      place: "client-knowledge",
      spot: ["#kb-tone", ".pad"],
      title: "Build it up",
      body: "Add notes, links and files to each section: Tone of Voice, Target Audience, what to lead with, and more.",
    },
  ],
  "connect-instagram": [
    ...toClientSettings("Connections", "Instagram"),
    {
      id: "ig-connect",
      place: "client-instagram",
      spot: ['section.panel[aria-label="Instagram account"]'],
      title: "Connect their Instagram",
      body: "Connect the client's Business or Creator account here, so the Feed Preview shows their real posts beside the planned ones.",
    },
  ],
  "plan-posts": [
    ...TO_PLANNER,
    {
      id: "pp-views",
      place: "project",
      spot: [".seg2"],
      title: "Week, Month or Calendar",
      body: "See the planner as a table by week or month, or as a calendar.",
    },
    {
      id: "pp-new",
      place: "project",
      spot: ['.split:has(button[aria-label="New Post"])'],
      title: "Add a post",
      body: "+ New opens the full window. Its arrow offers a row, to add one straight into the table.",
    },
    {
      id: "pp-columns",
      place: "project",
      spot: ["text=button|Columns"],
      title: "Choose your columns",
      body: "Show, hide, rename and reorder the table's columns, and add your own.",
    },
    {
      id: "pp-filters",
      place: "project",
      spot: ["text=button|All Statuses"],
      title: "Filter the posts",
      body: "Narrow the table to a status or a platform.",
    },
  ],
  "artwork-after-live": [
    ...toClientSettings("Profile", "Preferences"),
    {
      id: "al-keep",
      place: "client-preferences",
      spot: ['.srow:has(select[aria-label="Keep artwork for"])', 'select[aria-label="Keep artwork for"]'],
      title: "How long artwork is kept",
      body: "Once a post is Approved and live, its artwork is removed after this long, to keep storage down. Each client has its own setting.",
    },
  ],
  "other-content": [
    ...TO_ASSETS,
    {
      id: "oc-dates",
      place: "assets",
      spot: [".tbl thead", ".tbl", ".empty"],
      title: "Due Date and Publish Date",
      body: "A Project's assets are listed by when the work is due. The Publish Date is when each goes live.",
    },
  ],
  "send-for-review": [
    ...toPost("comments", "Why Niacinamide?, in Client Review"),
    {
      id: "sr-share",
      ...COMMENT_POST,
      spot: ['button[aria-label="Share for review"]'],
      title: "Share for review",
      body: "In Client Review, Share makes a link for your client to see the post, comment and approve, with no login.",
    },
    {
      id: "sr-window",
      ...COMMENT_POST,
      open: ['button[aria-label="Share for review"]'],
      spot: [".modal"],
      title: "What the link shows",
      body: "Choose the posts it shows, whether your client can approve, a passcode and when it expires. Then copy it or send it.",
    },
  ],
  comments: [
    ...toPost("comments", "Why Niacinamide?"),
    {
      id: "cm-box",
      ...COMMENT_POST,
      spot: [".composer"],
      title: "Leave a comment",
      body: "Write here. Private keeps it within your team; turn it off for your client to see it.",
    },
    {
      id: "cm-tools",
      ...COMMENT_POST,
      spot: [".cmt-tools"],
      title: "Pin it to a spot",
      body: "Pin a comment to a point on the artwork, or mark an area of it.",
    },
    {
      id: "cm-caption",
      ...COMMENT_POST,
      spot: [".hl-target mark", ".hl-target"],
      title: "Comment on the words",
      body: "Select part of the caption to comment on just that line, as the client did here.",
    },
    {
      id: "cm-resolve",
      ...COMMENT_POST,
      spot: ["text=button|Resolve"],
      title: "Resolve it",
      body: "Once it's dealt with, Resolve it. It stays in the thread, and can be reopened.",
    },
  ],
  "write-with-claude": [
    ...toPost("stages", "Morning Routine in 3 Steps"),
    {
      id: "dw-edit",
      place: "post",
      spot: ['[data-tour="edit"]'],
      title: "Open the post's window",
      body: "Edit opens the post's window, where the copy is written.",
    },
    {
      id: "dw-button",
      place: "post",
      open: ['[data-tour="edit"]'],
      spot: ["text=.modal button|Draft with Frank"],
      title: "Draft with Frank",
      body: "Frank drafts the copy from the concept and the client's knowledge, cleans up your own draft, or reviews it. Use This puts it in.",
    },
  ],
  "design-with-frank": [
    ...toPost("concept", "Winter Barrier Cream, still a concept"),
    {
      id: "df-edit",
      place: "post",
      post: "concept",
      spot: ['[data-tour="edit"]'],
      title: "Open the post's window",
      body: "Edit opens the post's window, on its Brief.",
    },
    {
      id: "df-button",
      place: "post",
      post: "concept",
      open: ['[data-tour="edit"]', 'text=.modal [role="tab"]|Brief'],
      spot: ["text=.modal button|Design with Frank"],
      title: "Design with Frank",
      body: "From the Brief, Frank suggests design directions for the artwork, from the concept and the client's style.",
    },
  ],
  "project-activity-discussion": [
    ...TO_PLANNER,
    {
      id: "pa-log",
      place: "project",
      spot: ['button[aria-label="Activity Log"]'],
      title: "Activity Log",
      body: "Everything that happened in the project: posts added, moved and approved, and by whom.",
    },
    {
      id: "pa-discussion",
      place: "project",
      spot: ['button[aria-label="Discussion"]'],
      title: "Discussion",
      body: "A place for your team to talk about the project as a whole, not one post.",
    },
  ],
  roles: [
    ...toWorkspacePage("Team", "Users"),
    {
      id: "rl-list",
      place: "team",
      spot: [".pad .clients", ".pad"],
      title: "Who can do what",
      body: "Each person's role is here. Owners and Admins see every client and manage the workspace; Users see the clients picked for them.",
    },
  ],
  team: [
    ...toWorkspacePage("Team", "Users"),
    {
      id: "tm-list",
      place: "team",
      spot: [".pad .clients", ".pad"],
      title: "Your team and your clients' people",
      body: "Everyone with access to your workspace is listed here, your own team and each client's people.",
    },
    {
      id: "tm-invite",
      place: "team",
      invites: true,
      spot: ['[data-tour="invite"]'],
      title: "Invite your team and your clients",
      body: "Invite Member asks for their email and role, and for a client's people, which client they're from.",
    },
  ],
  analytics: [
    ...toWorkspacePage("Analytics", "Analytics"),
    {
      id: "an-page",
      place: "analytics",
      title: "Analytics",
      body: "How long posts take from concept to approval, where they wait, and how much feedback they get, by client, project and person.",
    },
  ],
  settings: [
    ...TO_WORKSPACE_SETTINGS,
    {
      id: "st-nav",
      place: "settings",
      spot: [".setnav"],
      title: "Everything about your workspace",
      body: "Its name and address, preferences, colours and logo, team, knowledge, AI, connections, analytics and billing.",
    },
  ],
};
