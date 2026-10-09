// What each Analytics number is, and why it matters to how efficiently an
// agency runs (direct instruction: shown on hover over the number). One
// entry per number or column; the page looks them up by key.

export interface Explanation {
  what: string;
  why: string;
}

export const EXPLAIN = {
  sentAhead: {
    what: "How many days before its live date a post first reached Client Review. The middle value across the posts shown, so one outlier doesn't skew it.",
    why: "The days you give a client are the days they have to review without rushing. Working well ahead is what lets an agency absorb feedback calmly instead of reworking at the last minute.",
  },
  promiseMet: {
    what: "The share of posts that reached the client at least as far ahead as that client's promise (set in Client Settings → Preferences, 4 weeks unless changed).",
    why: "It's the promise you sell. Tracking it per post shows whether the team keeps it, and gives you evidence when a client says work arrives late.",
  },
  lateSends: {
    what: "Posts that first reached the client with under 7 days to go before going live, or after.",
    why: "Late sends squeeze the client's review, push approvals to the last minute and lead to rushed changes. Each one is worth a look: was it the brief, the team or the client?",
  },
  plannedAhead: {
    what: "Days from a post being created in Frank to its live date, the middle value across posts with a live date.",
    why: "Shows how early work is planned, before anyone starts making it. If planning is short, everything after it is short too.",
  },
  contractApproved: {
    what: "Approved posts going live this month, against the posts a month in each client's contract.",
    why: "Delivering what's contracted is the job. Seeing the gap early in the month gives time to close it.",
  },
  contractPlanned: {
    what: "Every post planned to go live this month, at any stage, against the contract.",
    why: "If fewer posts are planned than contracted, the month can't be delivered however fast the team works. It's the earliest warning.",
  },
  contractLastMonth: {
    what: "Approved posts that went live last month, against the contract.",
    why: "A month closed short is a conversation to have with the client, and a pattern to fix in planning.",
  },
  waitingOnUs: {
    what: "Posts not yet approved that are with the team: being made, in Internal Review, or with changes the client asked for. Days since the post last moved.",
    why: "This is the queue the agency controls. Anything sitting here for days is time the client will notice.",
  },
  waitingOnClient: {
    what: "Posts in Client Review that the client hasn't answered yet. Days since they were sent.",
    why: "Shows where the client is the hold-up, so you can chase with facts rather than feelings, and protect the team when deadlines slip.",
  },
  toApproval: {
    what: "Days from a post being created to being approved, the middle value across approved posts.",
    why: "The headline speed of the whole process. Shorter means more posts delivered with the same team.",
  },
  inConcept: {
    what: "Days a post spends in Concept, the middle value. Counted from 8 October 2026.",
    why: "Long Concept time usually means unclear briefs or work waiting for someone to start it.",
  },
  inInternal: {
    what: "Days a post spends in Internal Review, the middle value.",
    why: "This is the team reviewing its own work. If it's slow, the bottleneck is inside the agency, often one person who has to sign everything off.",
  },
  inClient: {
    what: "Days a post spends in Client Review, including rounds of changes, the middle value.",
    why: "The client's share of the timeline. Comparing it across clients shows who needs more lead time or a firmer review schedule.",
  },
  approvedBeforeLive: {
    what: "The share of approved posts with a live date that were approved on or before it.",
    why: "Anything approved after its live date either went out late or went out unapproved. Both cost trust.",
  },
  artworkVersions: {
    what: "The average number of artwork versions approved posts went through.",
    why: "Each extra version is design time. A rising number points to unclear briefs, misread feedback or a client who keeps changing direction.",
  },
  copyVersions: {
    what: "The average number of copy versions approved posts went through.",
    why: "Each extra version is writing time. High numbers often mean the brief or the client's tone of voice needs pinning down.",
  },
  firstTime: {
    what: "The share of approved posts that went through with one artwork version, one copy version and no changes asked.",
    why: "Right first time is the most efficient work an agency does. It's the clearest sign the brief, the team and the client are aligned.",
  },
  changesRequested: {
    what: "The share of posts where the client asked for changes at least once.",
    why: "Changes aren't bad in themselves, but a high share means time going into rounds rather than new work.",
  },
  turnaround: {
    what: "Hours from a client's comment to the team's next reply or new version on that post, the middle value.",
    why: "How responsive the agency is. Fast turnaround keeps the client engaged and keeps work moving.",
  },
  lastMinute: {
    what: "Posts approved less than 48 hours before going live.",
    why: "No room to fix anything if something's wrong. A pattern here usually traces back to late sends or slow client review.",
  },
  afterLive: {
    what: "Posts approved after their live date had passed.",
    why: "Either the post went out late or it went out before sign-off. Both are risks to the relationship.",
  },
  missedLive: {
    what: "Posts whose live date has passed and still aren't approved.",
    why: "Missed slots in the client's calendar, and often missed contract numbers. These need action now.",
  },
  rework: {
    what: "Every version made after a post's first, artwork and copy counted separately, across all the posts shown, finished or not.",
    why: "Rework is time spent redoing rather than making something new, and it's usually unbilled. Knowing how much there is, and for which clients, is how you price it in or cut it down.",
  },
  scopeChanges: {
    what: "Client comments Frank read as asking for something outside the original brief.",
    why: "Scope creep is invisible until it's counted. These are the conversations to have about extra time or budget.",
  },
  fromClient: {
    what: "Comments from the client's side: their people and guests on review links.",
    why: "How much the client engages. Very little can mean they're not really reviewing; a lot can mean the work isn't landing.",
  },
  fromTeam: {
    what: "Comments from the agency's own team.",
    why: "Shows how much internal review is happening before work reaches the client.",
  },
  unresolved: {
    what: "Comment threads not yet marked resolved, with the age of the oldest.",
    why: "Open threads are promises the team hasn't closed. Old ones are where things fall through the cracks.",
  },
  toResolve: {
    what: "Days from a comment being made to it being resolved, the middle value.",
    why: "How quickly feedback is acted on and closed off.",
  },
  categories: {
    what: "What each comment is about, as Frank reads it: copy, design, brand, scope and so on.",
    why: "Shows where feedback concentrates, so you can fix the cause (a brand guide, a briefing template) rather than the symptom.",
  },
  mood: {
    what: "Whether each comment reads as positive, neutral or negative, as Frank reads it. From 8 October 2026.",
    why: "An early signal of how the relationship feels, before it shows up in a call or a lost contract.",
  },
  repeats: {
    what: "The same kind of issue raised two or more times for the same client and format.",
    why: "Repeats are the cheapest problems to fix: one change in how the team works removes them for good.",
  },
  posts: {
    what: "Posts created in the period, matching the filters.",
    why: "The volume everything else is measured against.",
  },
  approved: {
    what: "Of those, posts approved.",
    why: "The work that's actually done.",
  },
  clientComments: {
    what: "Comments from the client's side.",
    why: "How much the client engages with the work.",
  },
  negative: {
    what: "The share of the client's scored comments that read as negative.",
    why: "An early warning of a relationship under strain.",
  },
  promise: {
    what: "This client's promise: how far ahead posts should reach them.",
    why: "What the client was told to expect.",
  },
} satisfies Record<string, Explanation>;

export type ExplainKey = keyof typeof EXPLAIN;
