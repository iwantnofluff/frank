// Frank's updates (direct instruction): every version with what changed,
// newest first. Shown in Settings → General → Updates, and the newest is
// the version this build is; a new one puts a notice in the team's bell
// and asks open tabs to reload. Numbered 1.minor.patch: a bigger update (a
// new feature or section) moves the middle number, a fix or small change
// the last.
export interface Release {
  version: string; // "1.12.0"
  date: string; // YYYY-MM-DD, the day it went live
  title: string; // a few words on the headline change
  changes: string[]; // what changed, in plain words for the agency's team
}

export const RELEASES: Release[] = [
  {
    version: "1.17.3",
    date: "2026-10-10",
    title: "Use This, field by field",
    changes: [
      "In Draft with Frank, each part of a draft has its own Use This: Caption, Alt Text and Text on Image go into the editor separately. The button then says Added; press it again to take it back out, or use another draft's to swap it in.",
      "A project's Discussion is a link with a chat icon after the Active and Archived pills, rather than in the “…” menu.",
    ],
  },
  {
    version: "1.17.2",
    date: "2026-10-10",
    title: "A line in a project's title",
    changes: [
      "A project's title has a thin line between the client's name and the project's, in place of the dash.",
    ],
  },
  {
    version: "1.17.1",
    date: "2026-10-10",
    title: "Stage pills everywhere, and a tidier table",
    changes: [
      "A post's stage switch shows Concept too, lit while the post has no artwork or copy yet, and its pills are a little larger.",
      "The post preview on the table, the Feed Preview and a review link's Feed show the same numbered stage pills as the table; the preview no longer repeats the post's name above it.",
      "The Team column is wider, without a picture before each name, and the role after a name is a little smaller.",
      "Week, Publish Date, Time, Status, Format and Slides are as wide as their words need, and no wider.",
    ],
  },
  {
    version: "1.17.0",
    date: "2026-10-10",
    title: "A post's Team, and new colours",
    changes: [
      "A post can have several people on its Team, not just one Lead: pick them in the post's window or the table's quick-add row, and the Team column lists them all with their roles.",
      "When a client's comments and approvals go to the post's Team, everyone on it hears.",
      "Five new colour presets in Brand Colours: Plum, Dusk, Paper, Harbour and Lagoon. Warm studio, Forest, Ink and Slate have gone; a workspace using one keeps its colours.",
      "Paper has a light rail, with Frank's logo and the header in dark.",
      "A project's Settings is wider, with a line between its two halves, and People lists Owners and Admins too.",
      "The Activity Log and Discussion have the Updates page's look: each day of the log is its own card.",
      "On a post's page, the stage switch uses the table's Status pills: grey until picked, then in the stage's colour.",
    ],
  },
  {
    version: "1.16.0",
    date: "2026-10-10",
    title: "A project's Activity Log and Discussion",
    changes: [
      "A project's page has a “…” menu with its Activity Log, its Discussion and its Settings.",
      "The Activity Log shows what happened in the project, by whom and when: posts added, edited, moved, approved or deleted, versions, comments, review links, and changes to the project and its people.",
      "Discussion gives the team a place to talk about a project, with threads and replies; mention someone with @ and they get a notice in their bell.",
      "The Strategy Overview boxes on a client's page are now all one height, with each overview in short paragraphs; hover over a box to read it in full. The month's box is named for it, Oct 2026 Strategy.",
      "Client and project rows no longer have an expand arrow: Client Settings is in the left rail inside a client, and a project's settings are in its “…” menu.",
      "The Client Review stage is now written the same way everywhere.",
      "Projects no longer have pictures; each is shown by its name.",
      "The stages are now in Frank's own colours: Concept red, Internal and Client Review orange, Approved green. On a project's table the Status pill is solid, with white words, and a little smaller.",
      "The Lead column is now called Team and is a little wider; a project's Settings can give each person a role, shown in brackets after their name.",
    ],
  },
  {
    version: "1.15.0",
    date: "2026-10-10",
    title: "Strategy at a glance",
    changes: [
      "Each Strategy box on a client's page is now a short overview Frank writes from everything in it, so you get the whole picture in a few seconds.",
      "Frank rewrites a box when what's in it changes, the next time someone on the team opens the client.",
      "The stage counts at the top of a client's page have made way for taller Strategy boxes; each project's row still counts its posts by stage.",
    ],
  },
  {
    version: "1.14.1",
    date: "2026-10-10",
    title: "Smoother left rail",
    changes: [
      "The left rail's links now slide and fade in and out the same way as the rest of Frank, and a new client's or project's name slides into place.",
    ],
  },
  {
    version: "1.14.0",
    date: "2026-10-10",
    title: "Working on a post together",
    changes: [
      "A project's table and its posts show who else on the team has them open, and who is editing.",
      "If someone saves a post while you're editing it, Frank stops your save and shows what they changed, so you can keep theirs or use yours.",
      "Changes to posts now appear on everyone's open pages without a refresh.",
    ],
  },
  {
    version: "1.13.0",
    date: "2026-10-09",
    title: "Updates",
    changes: [
      "Settings now has an Updates page under General, listing every version of Frank and what changed in it.",
      "A new version puts a notice in the team's bell, which opens its changes.",
      "When a new version goes live while Frank is open, a bar offers to reload so nobody keeps working on the old one.",
    ],
  },
  {
    version: "1.12.0",
    date: "2026-10-09",
    title: "Client notifications and workspaces",
    changes: [
      "When a client comments or approves, the team now hears about it in the bell and by email, and each client's Preferences choose who hears.",
      "Accounts are now called workspaces, one sign-in covers every workspace you belong to, and the profile menu switches between them.",
      "Each client has a monthly strategy in Client Settings that Draft with Frank follows, and old months can be archived to keep the list tidy.",
      "A client's page now opens with its brand and this month's strategy above the projects, which can now be sorted.",
      "Only the people on a client's own list can comment on or approve its review links, and the links open the client, project and post in Frank.",
      "You can edit your own comments, and the video player has an easier bar and a quick way back.",
      "The left rail names the client and its Content Planner on every page inside it, and stays put while the next page loads.",
      "Logos and photos no longer blink when a page reloads, and the Team list shows whether a pending invite still works.",
    ],
  },
  {
    version: "1.11.0",
    date: "2026-10-08",
    title: "Analytics and a review link feed",
    changes: [
      "Owners and Admins have a new Analytics page showing time to approval, posts made ahead against each client's promise, delivery against the contract and what the feedback says.",
      "Review links now have a Feed that shows the posts among the project's other work, and every post in Client Review is included.",
      "On a phone, review links read like Instagram, with swiping between posts and the first frame of each video showing.",
      "Each client now has Preferences for how long approved artwork is kept, whether it can approve, and what new review links start with.",
      "Owners can delete archived clients and projects for good, with every file removed, and Help explains what each role can do.",
      "Uploads now go up in confirmed pieces, carry on after a dropped connection, and can be up to 300MB.",
      "Review links load much faster.",
    ],
  },
  {
    version: "1.10.0",
    date: "2026-10-07",
    title: "Live comments and Frank's new look",
    changes: [
      "New comments and Draft with Frank messages now appear on every open device without a refresh, and your own comment shows the moment you post it.",
      "Comments now say whether they came from the team or the client.",
      "Review links open as a real page on any screen, with the desktop layout on a computer and the phone layout on a phone.",
      "The header carries Frank's logo, your workspace's logo and your profile menu, and the client's logo appears beside the handle in phone views.",
      "A large video that fails partway through saving now retries on its own, and any error shows beside its own Save button.",
      "A person is now either on the team or at a client within a workspace, never both.",
      "Frank now has a public privacy policy, linked from the sign-up page.",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-10-06",
    title: "Client Settings, search and Help",
    changes: [
      "Each client now has its own Client Settings area for its details, Knowledge and People.",
      "The header search finds clients, projects and pages, and matches projects by type.",
      "A Help panel opens from the header with articles on how Frank works.",
      "Long table cells show two lines with a Read more, and hovering a post or reference shows a preview.",
      "Artwork of approved posts is removed 7 days after they go live, with a warning first, and the bell is back to tell you.",
      "A team User can be given a client straight from that client's People, and files can now be up to 200MB.",
    ],
  },
  {
    version: "1.8.1",
    date: "2026-10-05",
    title: "The feed inside a phone",
    changes: [
      "The Feed Preview now sits inside a phone, with Instagram's portrait tiles, the client's profile and their Reels.",
      "Posts still to be scheduled are outlined in red and labelled, so they stand out from live posts.",
      "Live posts open inside the feed, with videos playing and carousels moving between slides.",
      "Text on Image now sits under each image on the post, saved with the post rather than as a copy version.",
      "A post can hold several references, linked wherever they show.",
      "Owners and Admins can give a project an emoticon as its picture.",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-10-04",
    title: "Client invites and the Instagram feed",
    changes: [
      "People at a client can be invited while the client is created, and they become the names offered on its review links.",
      "Users and Clients can be put on chosen projects, managed from new profiles for each project and client.",
      "Each level of the team can manage the people below it, and invites can be resent or removed.",
      "Owners and Admins can connect a client's Instagram so the real feed shows beside the planned posts.",
      "Drafting with Claude is now a conversation that uses the workspace's and the client's knowledge, and stays with the post.",
      "Approving on a review link shows at once and only ever counts once.",
      "When Frank's support team acts on your workspace, they give a reason that Owners can read in Settings.",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-10-03",
    title: "Plans, payments and self sign-up",
    changes: [
      "Settings is now a left menu of sections, each page with its own address and its own save.",
      "Colour presets and interface colours are now one Brand Colours page.",
      "Workspaces can see their plan and usage, and upgrade by card through Paddle.",
      "New teams can sign up on their own and start with a 30-day free trial.",
      "Each plan's limits on people, clients, storage and branding are now enforced.",
      "Uploaded files are private again and only open through Frank.",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-10-02",
    title: "Your own address and lighter videos",
    changes: [
      "Each workspace now has its own web address, and someone in two workspaces only sees the work of the one they are on.",
      "Videos are compressed in the browser before upload, so a 28MB Reel becomes under 2MB.",
      "An uploader shows each step of saving artwork, with its progress and size.",
      "Every sign-in page now has a way to reset a forgotten password.",
      "Member and client limits are now enforced, and a paused workspace is locked on every address.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-10-01",
    title: "Roles, profiles and carousels",
    changes: [
      "The team now has Owner and Primary Owner roles, Users can be given access to chosen clients, and team members can be invited by email.",
      "Everyone has a profile with a name, designation, bio and a photo cropped to the head automatically.",
      "The rail avatar opens an account menu with sign-out, and the rail follows where you are inside a client.",
      "Projects can be moved between clients, and clients can have an image and a description.",
      "Branding matches the design and its colours now apply across Frank.",
      "A post can have several formats, can be added straight into the table, and keeps copy versions in tabs.",
      "Carousels are supported, with per-slide text and video slides, and Reels can take comments at a moment in the video.",
    ],
  },
  {
    version: "1.4.1",
    date: "2026-09-30",
    title: "Folders and permanent delete",
    changes: [
      "Posts can be deleted permanently as well as archived, and selected with checkboxes.",
      "Each client can have project folders.",
      "Saving a new post twice no longer creates a duplicate, and New Brief is now called New Post.",
      "Share for Review is only offered once a post is in Client Review.",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-09-29",
    title: "A redesigned review screen",
    changes: [
      "The post review screen has a new typeface, a collapsible section menu and a real Feed Preview.",
      "Clients and projects can be renamed and archived from a menu on each row.",
      "A client can have a team of contacts, who pick their name when commenting or approving on a review link.",
      "Every comment is sorted into a type as it arrives, and a new brief warns when the same issue keeps coming up.",
      "The continuous-delivery calendar now matches the scheduled one.",
      "Hover previews, popovers and menus always stay fully on screen.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-09-25",
    title: "One window for every post",
    changes: [
      "Brief, Content and Checks now live in one Edit window, each with its own save.",
      "Copy can be drafted with AI, and checked against the WIIFM and the brand.",
      "The stages are now Concept, Internal Review, Client Review and Approved, and a post leaves Concept as soon as something is saved.",
      "The team can approve a post directly, or take an approval back.",
      "Share now picks the current post or several posts from a grid.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-23",
    title: "Clients, projects and Knowledge",
    changes: [
      "New clients and projects can be created, and each client has its own page.",
      "Scheduled projects have a calendar table with saved column views.",
      "Knowledge holds file uploads, Reference Material and categorised Format Directions.",
      "Error messages now say what actually went wrong instead of failing quietly.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-09-21",
    title: "New posts and stage changes",
    changes: [
      "New Brief creates a post from a brief, with formats chosen from a full catalogue.",
      "A post can be moved on to its next stage.",
      "The Share window says up front which posts can be shared, rather than failing quietly.",
      "Settings and Visibility now follow each person's real role.",
      "Whoever wrote a comment can now resolve or reopen it.",
      "Calendar, Analytics and Visibility open a page instead of a dead end.",
    ],
  },
  {
    version: "1.0.2",
    date: "2026-09-20",
    title: "Real numbers on the dashboard",
    changes: [
      "The dashboard's stat cards and the client page's project rows now show real counts.",
      "The review link has a Phone and Desktop switch to preview either layout.",
      "Calendar, Analytics and Visibility only show in the rail inside a client.",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-09-19",
    title: "Clearer internal comments",
    changes: [
      "Internal comments are now clearly marked, and the internal toggle shows a lock.",
      "Dropdowns across Frank have a consistent look and focus state.",
      "The login page's fields are the right size again.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-09-18",
    title: "Frank's first release",
    changes: [
      "A dashboard of clients, each with its projects and their posts.",
      "A review screen for each post, with artwork, copy and comments, including internal ones the client never sees.",
      "Review links let a client comment on and approve posts without signing in.",
      "Settings for branding, the team and Knowledge.",
    ],
  },
];

export const CURRENT_RELEASE = RELEASES[0];
