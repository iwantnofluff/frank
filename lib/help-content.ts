// Frank's help articles (direct instruction: a help panel like Slack's,
// opened from the "?" in the header). Plain data, so the panel can search
// and show them. Keep each article true to what the app does today; when a
// feature changes, change its article in the same piece of work.

export type HelpBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "note"; text: string };

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  blocks: HelpBlock[];
}

export interface HelpCategory {
  id: string;
  label: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { id: "start", label: "Getting started" },
  { id: "clients", label: "Clients and Client Settings" },
  { id: "posts", label: "Projects and posts" },
  { id: "reviews", label: "Reviews and approvals" },
  { id: "claude", label: "Drafting with Frank" },
  { id: "team", label: "Your team" },
  { id: "account", label: "Settings and billing" },
];

// The cards at the top of the panel, in order.
export const HELP_TOPICS = ["create-client", "plan-posts", "send-for-review", "write-with-claude", "connect-instagram"];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "how-frank-works",
    title: "How Frank works",
    category: "start",
    summary: "Clients, projects and posts, and the stages a post moves through.",
    blocks: [
      {
        kind: "p",
        text: "Frank is where your agency plans content, writes it, and gets it approved by your clients. Everything sits under a client, and every client has projects.",
      },
      { kind: "h", text: "Clients, projects and posts" },
      {
        kind: "list",
        items: [
          "A client is a brand you work for. Its Client Settings hold its details, its people, its Knowledge and its Instagram.",
          "A project is a piece of work for that client. A Content Planner project schedules posts by publish date and time. An Other Content project tracks deliverables by live date and destination.",
          "A post is one piece of content: its brief, its artwork, its Text on Image and its copy.",
        ],
      },
      { kind: "h", text: "The four stages" },
      {
        kind: "steps",
        items: [
          "Concept: the brief is written.",
          "Internal Review: your team makes and checks the artwork and copy.",
          "Client Review: the client sees it, through Frank or a review link, and comments.",
          "Approved: the client has signed it off.",
        ],
      },
      {
        kind: "p",
        text: "On a post, the stage switch shows Internal Review in blue, Client Review in orange and Approved in green.",
      },
      { kind: "h", text: "Getting around" },
      {
        kind: "p",
        text: "The left rail follows where you are, and names the client: on a client's projects you'll see Clients and the client's Settings (Casa Carigar Settings, say); inside a project, the client's Projects too; on a post, the project's Content Planner or Other Content as well. Frank's logo in the top left corner takes you back to Clients. Your picture at the top right holds My Profile, Settings for your whole agency, and Sign out.",
      },
    ],
  },
  {
    id: "search",
    title: "Find a page, client or project fast",
    category: "start",
    summary: "Search from the header, or press ⌘K.",
    blocks: [
      {
        kind: "p",
        text: "The search box in the header finds pages, clients and projects you can see. Start typing and matches appear straight away, each marked Page, Client or Project.",
      },
      {
        kind: "list",
        items: [
          "Type a page's name to open it: Clients, a Settings page such as Users or Reference Material, or a client's Client Settings pages such as Knowledge.",
          "Type a project's type to list them all: planner finds every Content Planner, other content every Other Content project.",
          "Press ⌘K (Ctrl K on Windows) to jump into search from anywhere.",
          "Use the arrow keys to move through the results and Enter to open one, or click it.",
          "Projects show their client and type, so similar names are easy to tell apart.",
        ],
      },
    ],
  },
  {
    id: "create-client",
    title: "Create a client and its first project",
    category: "clients",
    summary: "Add a client, then the project its work will live in.",
    blocks: [
      { kind: "h", text: "Add the client" },
      {
        kind: "steps",
        items: [
          "Go to Clients and choose New Client.",
          "Give it a name, and if you like an industry, a description and a square logo.",
          "Choose Create Client. It appears in your clients list.",
        ],
      },
      { kind: "h", text: "Add its first project" },
      {
        kind: "steps",
        items: [
          "Open the client from your clients list.",
          "Choose New Project and give it a name.",
          "Pick Content Planner for scheduled posts, or Other Content for deliverables such as ads or listings.",
        ],
      },
      {
        kind: "note",
        text: "A project's type is fixed once it's made, so choose with care. Owners and Admins can give a project a picture by clicking its tile on the client's projects list.",
      },
    ],
  },
  {
    id: "client-settings",
    title: "Client Settings",
    category: "clients",
    summary: "A client's details, people, Knowledge and Instagram, in one place.",
    blocks: [
      {
        kind: "p",
        text: "Open a client's Settings from the left rail while you're in a client (it carries the client's name, Casa Carigar Settings, say), or from the expand icon on the client's row in your clients list.",
      },
      {
        kind: "list",
        items: [
          "Client Details: the name, logo, industry and description, and archiving.",
          "People: who's on this client and which of its projects each person works on, and inviting someone new.",
          "Knowledge: what Frank knows about the client, used when copy is drafted and checked.",
          "Instagram: the client's account, so the Feed Preview shows its real posts.",
        ],
      },
      { kind: "h", text: "People" },
      {
        kind: "list",
        items: [
          "Each person's projects are listed by name under them. Click one to open that project.",
          "Edit Projects opens a window to choose their projects. Save greys out with Saved once it's done.",
          "The User or Client tag is a dropdown: pick the other to switch them, straight away. A pending invite can be resent or removed from the same dropdown.",
          "+ Invite People invites someone new, or gives a User already on your team this client, from A User on Your Team. Each one added brings you back to the window for the next.",
        ],
      },
      {
        kind: "note",
        text: "Owners and Admins change details and people. Users see them read only. A client's own people see their Knowledge only.",
      },
    ],
  },
  {
    id: "knowledge",
    title: "Build a client's Knowledge",
    category: "clients",
    summary: "Tone of voice, audience, research and more, for better copy and checks.",
    blocks: [
      {
        kind: "p",
        text: "Knowledge has eight areas, from Tone of Voice to Moodboard and References. The more of them are filled in, the more Draft with Frank and the checks can draw on. An area with nothing in it yet says Content pending.",
      },
      { kind: "h", text: "Add to an area" },
      {
        kind: "list",
        items: [
          "Write Note: a title and a few lines. Examples work better than adjectives.",
          "Upload File: a PDF or an image, such as a brand book or a moodboard. Files are read as they are.",
          "Notes can be edited later. Remove asks you to confirm first.",
        ],
      },
      {
        kind: "note",
        text: "Knowledge that applies to every client, such as your agency's own playbooks, belongs in Settings, under Reference Material.",
      },
    ],
  },
  {
    id: "connect-instagram",
    title: "Connect a client's Instagram",
    category: "clients",
    summary: "Show the client's real posts beside the planned ones.",
    blocks: [
      {
        kind: "p",
        text: "With a client's Instagram connected, its Feed Preview shows the real profile and posts, so the client sees how planned posts will sit in their grid. Only Business and Creator accounts can be connected.",
      },
      { kind: "h", text: "Two ways to connect" },
      {
        kind: "list",
        items: [
          "Connect: signs in with the Instagram account this browser is signed into at instagram.com. Sign into the client's account there first.",
          "Send Link: makes a link the client opens to connect it themselves. It works once, for seven days.",
        ],
      },
      {
        kind: "steps",
        items: [
          "Open the client's Client Settings and choose Instagram.",
          "Choose Connect or Send Link.",
          "Once connected, check the username shown is the right account.",
        ],
      },
      {
        kind: "note",
        text: "If a connection stops working, it's marked Needs reconnecting. Choose Reconnect to sign in again. Owners and Admins connect accounts.",
      },
    ],
  },
  {
    id: "plan-posts",
    title: "Plan posts in the Content Planner",
    category: "posts",
    summary: "Brief a post, then add its artwork, Text on Image and copy.",
    blocks: [
      {
        kind: "p",
        text: "In a Content Planner project, choose New Post. Use Window for the full form, or Row to type a quick post straight into the table. On a post's own page, New Post beside Edit opens the window for another post in the same project.",
      },
      { kind: "h", text: "The brief" },
      {
        kind: "list",
        items: [
          "Post Name, and every Format it goes out as. A carousel asks how many slides it has.",
          "Publish Date and Time, and a Lead from your team.",
          "The Concept, and any References, each of which opens when clicked in the table.",
        ],
      },
      { kind: "h", text: "The content" },
      {
        kind: "list",
        items: [
          "Creative: one slot per slide, or one for a single image or video, up to 300MB a file. A file dropped in isn't added until you press Save Creative V1 (then V2 and so on); closing first asks if you're sure.",
          "Text on Image: the words on each slide, saved with Save Text on Image. It stays with the post rather than becoming a version.",
          "Copy: the caption and anything else the formats need. Save Copy V1, then V2 and so on.",
        ],
      },
      {
        kind: "p",
        text: "Saving shows each step: compressing a video, uploading, then saving the version. Keep the window open until it says the version is saved. A file goes up in pieces, so if the connection drops, Frank carries on from where it was once it's back; if it still can't, the reason shows under Save.",
      },
      {
        kind: "note",
        text: "Earlier versions stay in each section's tabs, read only, and can be deleted if nobody has commented on them.",
      },
    ],
  },
  {
    id: "artwork-after-live",
    title: "Artwork after a post goes live",
    category: "posts",
    summary: "Approved posts' artwork is removed 7 days after going live; copy and comments stay.",
    blocks: [
      {
        kind: "p",
        text: "To keep your storage free for work in progress, an Approved post's artwork is removed 7 days after its live date: every version's files. The post, its copy and all its comments stay, and the post says when its artwork was removed.",
      },
      {
        kind: "list",
        items: [
          "Once an Approved post has gone live, its page says the day its artwork will be removed, so there's time to keep a copy.",
          "Posts that aren't Approved keep their artwork, whatever their date.",
          "The review link shows the same: Artwork removed, with the copy and comments still there.",
        ],
      },
      { kind: "h", text: "Posts with no live date" },
      {
        kind: "p",
        text: "An Approved post with no live date, in Other Content say, isn't removed on its own. 7 days after its due date, Owners and Admins get a notification under the bell in the header. Opening it shows the post with Keep Artwork or Remove Artwork. Keep is for good: you won't be asked about that post again.",
      },
    ],
  },
  {
    id: "other-content",
    title: "Track Other Content",
    category: "posts",
    summary: "Deliverables with a live date and a destination.",
    blocks: [
      {
        kind: "p",
        text: "Other Content projects suit ads, listings and other deliverables that go live somewhere rather than on a posting schedule.",
      },
      {
        kind: "list",
        items: [
          "Each post has a Live Date and a Destination, such as a URL, an ASIN or a location.",
          "Funnel and Notes for Designer can be set in the post window or in the table.",
          "The table also shows TG, Final Creative and Principles, edited in place.",
        ],
      },
    ],
  },
  {
    id: "send-for-review",
    title: "Send posts to your client for review",
    category: "reviews",
    summary: "Move posts to Client Review and share a review link.",
    blocks: [
      {
        kind: "steps",
        items: [
          "Move a post to Client Review from its page.",
          "Choose the share icon, then Create link, for this post or several.",
          "Add a passcode if you'd like the link protected.",
          "Choose Copy. It greys out with Link copied once it's on your clipboard.",
          "Send the link to your client. They can comment, and approve if you allow it, without an account.",
        ],
      },
      {
        kind: "note",
        text: "Only posts in Client Review can be shared. Posts still in Concept or Internal Review are greyed out when choosing several.",
      },
      { kind: "h", text: "What your client sees" },
      {
        kind: "p",
        text: "It's one link for every device. On a phone it fills the screen like a post, scrolling down to the comments. On a computer the post sits in a phone, sized to the window, with the caption scrolling inside it. With the client's Instagram connected there's a Feed view of their real grid too. An approval counts once, however many times it's pressed.",
      },
      {
        kind: "p",
        text: "People you've invited as Clients of that client are listed under Who are you?, so they can comment under their own name straight away. Anyone else can choose Someone else and give a name and email.",
      },
    ],
  },
  {
    id: "comments",
    title: "Comment, pin and resolve",
    category: "reviews",
    summary: "Talk about a post right where the point is.",
    blocks: [
      {
        kind: "list",
        items: [
          "Comments are Public, seen by the client, or Private, for your team only.",
          "Each name says whose side it's from: Rajesh Rana (No Fluff) for your agency, Parth Dogra (Casa Carigar) for the client, review link guests included.",
          "Drop a pin or mark an area on the artwork. On a video, a comment remembers the moment it was made.",
          "Select words in the caption to comment on just those.",
          "Resolve a comment once it's dealt with. Filter by All, Unresolved, Resolved, Mine or Private.",
        ],
      },
    ],
  },
  {
    id: "write-with-claude",
    title: "Draft copy with Frank",
    category: "claude",
    summary: "Draft from the concept, or have your own draft reviewed.",
    blocks: [
      {
        kind: "p",
        text: "In a post's Content tab, choose Draft with Frank under the Caption. Frank reads the brief, the WIIFM, each format's direction, and your agency's and the client's Knowledge, files included.",
      },
      {
        kind: "list",
        items: [
          "Draft from the Concept: Frank offers a few drafts of the caption, the other copy fields and the Text on Image.",
          "Review My Draft: Frank says what works in what you've written and how to improve it.",
          "Ask for changes in your own words: shorter, warmer, a different hook.",
          "Use This puts a draft into the editor. Nothing is saved until you save it.",
        ],
      },
      {
        kind: "note",
        text: "Each message uses one of your agency's monthly AI requests. Conversations stay with the post for your team.",
      },
    ],
  },
  {
    id: "team",
    title: "Invite your team and your clients",
    category: "team",
    summary: "Roles, and who can see and change what.",
    blocks: [
      {
        kind: "list",
        items: [
          "Primary Owner and Owners run the account. Admins manage clients, projects and people.",
          "Users work on the clients and projects they're given.",
          "Clients are the brand's own people. They see their own projects, review posts and read their Knowledge.",
        ],
      },
      {
        kind: "p",
        text: "Invite people from Settings, under Team, or from a client's People page. Each person can change the type of, resend invites to, and remove only the people below them.",
      },
      {
        kind: "note",
        text: "Someone is either on your team or at a client, never both. Inviting a team member as a Client, or a client's person onto your team, is refused with the reason. To move someone across, change their type instead. A Client can be on more than one of your clients.",
      },
    ],
  },
  {
    id: "settings",
    title: "Your agency's Settings",
    category: "account",
    summary: "Branding, Knowledge, AI, connections and billing.",
    blocks: [
      {
        kind: "p",
        text: "Open Settings from your picture at the top right of the header. Owners and Admins can change most of it.",
      },
      {
        kind: "list",
        items: [
          "General: your account's name and web address, and anything Frank's support has done in your account.",
          "Customisation: your logo and brand colours, on plans that include branding. Your logo shows in the header, after Frank's; until there is one, Owners and Admins can choose Add Logo there.",
          "Team: your Users and Clients, and inviting people.",
          "AI Governance: the AI model Draft with Frank uses.",
          "Connections: every client's Instagram in one list.",
          "Your Plan and Billing: your plan, payment methods and invoices.",
          "Knowledge: Format Directions for each format, and Reference Material shared across every client.",
        ],
      },
    ],
  },
];

const BY_ID = new Map(HELP_ARTICLES.map((a) => [a.id, a]));
export const helpArticle = (id: string) => BY_ID.get(id) ?? null;

// Articles whose title, summary or text has every word typed, best first
// (title matches ahead of body matches).
export function searchHelp(query: string): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const text = (a: HelpArticle) =>
    [a.summary, ...a.blocks.flatMap((b) => ("items" in b ? b.items : [b.text]))].join(" ").toLowerCase();
  return HELP_ARTICLES.map((a) => {
    const title = a.title.toLowerCase();
    const body = text(a);
    if (!words.every((w) => title.includes(w) || body.includes(w))) return null;
    return { a, score: words.filter((w) => title.includes(w)).length };
  })
    .filter((x): x is { a: HelpArticle; score: number } => !!x)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}
