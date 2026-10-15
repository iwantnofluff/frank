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
    version: "1.31.1",
    date: "2026-10-15",
    title: "Easier help articles",
    changes: [
      "Help articles come in shorter paragraphs with more space between them, and long points are broken up too, so they're quicker to read.",
      "Help now covers the Live stage and the live date, the New posts tick, and the project's three icons.",
    ],
  },
  {
    version: "1.31.0",
    date: "2026-10-15",
    title: "A project's default post team",
    changes: [
      "In a project's settings, tick New posts beside anyone on the team (Owners, Admins and Users) to put them on every new post's Team. A new post starts with them, and its Team can still be changed.",
      "On a project's page, Discussion, Activity Log and Settings are now three icons side by side, in place of the … menu.",
    ],
  },
  {
    version: "1.30.2",
    date: "2026-10-14",
    title: "Late from today on",
    changes: [
      "A post only counts as late if it was planned from 14 Oct 2026 on. Anything planned before then is taken to have gone live on its planned day, so its live date shows in green.",
      "Approved posts planned before 14 Oct 2026 have moved to 5. Live.",
    ],
  },
  {
    version: "1.30.1",
    date: "2026-10-14",
    title: "A tidier view for clients",
    changes: [
      "Clients now see a post's stage pills, so they know where it is, but can't change them.",
      "Clients no longer see Share for review, the Private comment filter, or the planner's controls for adding and saving views.",
      "Analytics is for the team: a client opening it is taken to their dashboard.",
    ],
  },
  {
    version: "1.30.0",
    date: "2026-10-14",
    title: "5. Live",
    changes: [
      "Posts have a fifth stage, 5. Live, in a darker green. Frank moves a post to Live when it finds it on the client's Instagram; the team can also set it by hand for posts Frank can't find (Stories, other platforms, clients without Instagram connected).",
      "On a post's page, the date it really went live shows in brackets after its planned date: green if it went live that day or earlier, red if later.",
      "If Frank finds a post live before it was approved, Owners and Admins are told in the bell.",
      "The planner's status filter and legend include Live.",
    ],
  },
  {
    version: "1.29.0",
    date: "2026-10-14",
    title: "Frank notes when posts really went live",
    changes: [
      "Each night, for clients with Instagram connected, Frank finds scheduled Instagram posts on their account by caption, and notes when each one really went live and how late it was. Only near-exact caption matches count, so no wrong date gets in.",
      "This is collected for Analytics: how often posts go out late, and by how much.",
      "An Approved post's artwork is now kept for its usual time from when it really went live, where Frank has found it, rather than from its planned date.",
    ],
  },
  {
    version: "1.28.2",
    date: "2026-10-14",
    title: "The expand button stays in view",
    changes: [
      "Scrolling a Reel's post in the phone, the expand button stays just below the top bar once the video's edge reaches it.",
    ],
  },
  {
    version: "1.28.1",
    date: "2026-10-14",
    title: "A Reel expands inside the phone",
    changes: [
      "A Reel's expand button now fills the phone's screen with the video, as the app does, instead of your whole screen. Press it again, or Esc, to put it back.",
    ],
  },
  {
    version: "1.28.0",
    date: "2026-10-14",
    title: "Watch a Reel full screen",
    changes: [
      "A Reel, YouTube Short or Meta Stories / Reels Ad has a full-screen button at the top right of its video, on the post's page and on review links.",
      "Full screen shows the video as tall as the screen allows, with its timeline and comment markers underneath. Press the button again, or Esc, to come back.",
      "Adding a post, saving its Brief the first time takes you straight to the Content tab.",
    ],
  },
  {
    version: "1.27.1",
    date: "2026-10-14",
    title: "Stories sit better in the phone",
    changes: [
      "A story's top corners are square, as the phone's screen is there; its bottom corners stay rounded above the reply bar.",
      "With several stories, the account sits clear of the bars above it, as on Instagram, with the back arrow level with it.",
    ],
  },
  {
    version: "1.27.0",
    date: "2026-10-14",
    title: "Several stories in one post",
    changes: [
      "An Instagram Story, Facebook Story or WhatsApp Status post has a number of stories, 1 to 20, chosen in the post window as a carousel's slides are.",
      "Each story gets its own upload and its own Text on Image box. Story posts have no Copy section.",
      "On the post's phone and on review links, several stories show Instagram's bars along the top, with arrows to move between them.",
    ],
  },
  {
    version: "1.26.1",
    date: "2026-10-14",
    title: "A new comment shows once",
    changes: [
      "A comment you post no longer shows twice for a moment while it saves.",
      "A client's comment no longer shows as Private while it posts; a client's comments are always public.",
      "Resolve and Reopen change the comment as soon as you click.",
    ],
  },
  {
    version: "1.26.0",
    date: "2026-10-14",
    title: "Owners can delete comments",
    changes: [
      "The Primary Owner and Owners can delete any comment on a post, from the team or the client. Deleting a comment takes its replies with it; a reply can also be deleted on its own.",
      "You're asked first. A deleted comment is gone for everyone, on the post and on any review link.",
    ],
  },
  {
    version: "1.25.1",
    date: "2026-10-14",
    title: "Clearer section icons on a post",
    changes: [
      "The Brief, Content, Checks and Feed icons on a post's page are 10% larger and dark, lightening as you hover over one.",
      "Checks has a new icon, a box with a tick, matching the others' size and line weight.",
    ],
  },
  {
    version: "1.25.0",
    date: "2026-10-13",
    title: "Choose a project's columns",
    changes: [
      "New Project has a second step, Columns: every column is ticked to start. Untick any the project doesn't need, drag them into order, rename them, and see what each one records. This becomes the project's table.",
      "Add a project's own columns, such as Thumbnail Text, choosing what each records: Single Line Text, Large Text, Number, Date, Dropdown or Checkbox. They're filled in from the post window, when adding a post or editing one.",
      "The table's Columns picker works the same way: drag, rename and add columns there too. Renaming changes the column for the whole project; anything else you change is kept by saving it as a view.",
      "Saved views now belong to their project. Ones saved before this stay shared until you save over them.",
      "Adding, renaming and choosing a project's columns is for Owners and Admins.",
    ],
  },
  {
    version: "1.24.8",
    date: "2026-10-13",
    title: "Filter the planner by stage and platform",
    changes: [
      "The planner's status filter lists the four stages, 1. Concept to 4. Approved, in place of the older In Production, Changes Requested and Rejected.",
      "A new platform filter shows the posts going out on Meta (Instagram, Facebook, WhatsApp), LinkedIn, Pinterest or YouTube. A post on several shows under each.",
    ],
  },
  {
    version: "1.24.7",
    date: "2026-10-13",
    title: "Late posts stand out; Share by the pills",
    changes: [
      "In the Feed, a planned post that's past its date and not yet live shows its date in bold red.",
      "On a post's page, Share sits beside the stage pills and appears only while the post is in Client Review, its name sliding out as you hover.",
    ],
  },
  {
    version: "1.24.6",
    date: "2026-10-13",
    title: "A live post shows once in the Feed",
    changes: ["Looking at a post that has gone live, its Feed no longer shows it twice: with the client's Instagram connected, the real post stands for it."],
  },
  {
    version: "1.24.5",
    date: "2026-10-13",
    title: "A roomier post page",
    changes: [
      "The post page's Brief, Content, Checks and Feed (was Feed Preview) are icons in the top-left corner of the centre, not a column of their own, giving the post more room. The chosen one shows its name; the others show theirs as you hover.",
      "The stage pills sit at the left of the top bar, about a fifth larger.",
    ],
  },
  {
    version: "1.24.4",
    date: "2026-10-13",
    title: "Moving projects is for Owners and Admins",
    changes: ["Only Owners and Admins can move a project to another client; Users no longer see Move to Client."],
  },
  {
    version: "1.24.3",
    date: "2026-10-13",
    title: "What a User can change",
    changes: [
      "Format Directions and Reference Material are Owners' and Admins' to change; Users read them.",
      "Only Owners and Admins can archive or restore a client or a project.",
      "For a User, the Workspace Name shows as text rather than a box they can't type in.",
    ],
  },
  {
    version: "1.24.2",
    date: "2026-10-13",
    title: "Comments at once, and a tidier phone",
    changes: [
      "A comment shows on everyone else's open post page the moment it arrives, rather than after the comments reload.",
      "The comment box on the artwork stays inside the phone, wherever the pin or area is, and no longer slides the post sideways.",
      "The phone's post scrolls without a scroll bar showing.",
      "A Reel, or any video post, fills the phone's width with no gap down the sides.",
    ],
  },
  {
    version: "1.24.1",
    date: "2026-10-13",
    title: "Artwork that loads fast",
    changes: ["Uploaded images also get a light copy sized for the phone, about 30 times smaller, so a post's artwork shows with the page instead of after it. The original is kept for downloads. Artwork already uploaded has its copy made too."],
  },
  {
    version: "1.24.0",
    date: "2026-10-13",
    title: "A true iPhone 15",
    changes: [
      "The phone is drawn as an iPhone 15: its 393 × 852 screen and rounded corners, the Dynamic Island in place of the old notch, and its buttons on the right sides.",
      "A Story sits on it as Instagram lays one out: full width under the status bar, nothing cropped, with Instagram's Send message bar below.",
    ],
  },
  {
    version: "1.23.9",
    date: "2026-10-13",
    title: "No line across a Story",
    changes: ["The thin white line across the top of a Story is gone. It was Instagram's progress bar, but it read as a line on the artwork."],
  },
  {
    version: "1.23.8",
    date: "2026-10-13",
    title: "Stories fill the phone",
    changes: ["A Story's phone is shaped to the story, so its artwork or video fills the screen edge to edge, with nothing cropped and no black below. A video's timeline sits over its foot. Feed posts keep the usual phone."],
  },
  {
    version: "1.23.7",
    date: "2026-10-13",
    title: "Invites from Team only",
    changes: [
      "Invites are sent from Workspace Settings → Team only.",
      "The New Client window has a Team dropdown of Users already on your team, who get the client as it's made, in place of inviting people.",
      "A client's People page has + Add People, for Users already on your team, in place of + Invite People.",
    ],
  },
  {
    version: "1.23.6",
    date: "2026-10-13",
    title: "A cleaner Story",
    changes: ["A Story's artwork now starts at the very top of the phone, whole, with the progress line, back arrow and account over it as on Instagram. The stray line and the upload date are gone."],
  },
  {
    version: "1.23.5",
    date: "2026-10-13",
    title: "Feeds newest first",
    changes: ["The Feed Preview and a review link's Feed put the newest planned post first, as Instagram does, with posts that have no date yet at the very start."],
  },
  {
    version: "1.23.4",
    date: "2026-10-13",
    title: "Live posts in the Feed Preview",
    changes: [
      "Every planned post in the Feed Preview shows its date, with or without artwork.",
      "An Approved post whose date has passed counts as live. With the client's Instagram connected, it leaves the planned posts, as the real one shows from Instagram. Without it, it stays, marked Live.",
    ],
  },
  {
    version: "1.23.3",
    date: "2026-10-13",
    title: "Room for the previous and next titles",
    changes: ["The previous and next post's details are half as wide again, so their titles wrap onto fewer lines, and sit 50px from the phone with their arrow beside them, however short the title."],
  },
  {
    version: "1.23.2",
    date: "2026-10-13",
    title: "Quicker, roomier previous and next",
    changes: [
      "The previous and next post sit further from the phone, a little bigger and wider, and open straight away: they're loaded before you click.",
      "The arrow steps to the previous or next post, and the date, title and format open it too, each with its own hover.",
      "The post's own date, title and format are above the phone, which is a little smaller and lower to make room, so the trail at the top no longer repeats the date. The previous and next post's titles match its size.",
    ],
  },
  {
    version: "1.23.1",
    date: "2026-10-13",
    title: "Previous and next post beside the phone",
    changes: [
      "On a post's page, arrows either side of the phone open the project's previous and next post, in the planner's date order, each with its date, title and format beside it. On a narrower window it's just the arrows, with the details when you hover.",
    ],
  },
  {
    version: "1.23.0",
    date: "2026-10-12",
    title: "Workspace Settings and Preferences",
    changes: [
      "Settings is now Workspace Settings, with Workspace Name and Workspace URL in place of Account Name and Account URL.",
      "Notifications is now Preferences, in two sections: Notifications (how long read ones stay) and Review Links.",
      "Review Links sets how far back a review link lists Approved posts: 7, 14, 21 or 28 days, or Always. It's 14 days unless changed. A link always keeps the posts it was sent for.",
    ],
  },
  {
    version: "1.22.4",
    date: "2026-10-12",
    title: "A clearer review link list",
    changes: [
      "A review link's list has one level of heading, in capitals with a line between: Sent for review (or Waiting for your review, on a link to the whole project), Also waiting for your review, and Approved. A post the client has commented on says Commented beside it.",
      "Approved shows the last 30 days only, so the list stays short. A link always keeps the posts it was sent for.",
      "Each post's date is above its name, in small grey type. The post's name and format no longer sit above the phone, which is a little bigger for it and centred top to bottom.",
    ],
  },
  {
    version: "1.22.3",
    date: "2026-10-12",
    title: "The publish date beside the post's name",
    changes: [
      "On a post's page, the trail at the top gives its date after its name, e.g. Test (16 Oct 26): the Publish Date in a scheduled project, the Live Date in a continuous one. A post with no date yet shows its name alone.",
      "On a review link, Sent for review and Also waiting for your review are in capitals, like Draft with Frank's headings.",
    ],
  },
  {
    version: "1.22.2",
    date: "2026-10-12",
    title: "Review links open on what you sent",
    changes: [
      "A review link made for one post, or a few, opens on them, even after the client has commented. They're listed first under Sent for review, and the project's other posts in Client Review follow under Also waiting for your review. On a phone, the link's posts come first and the others say so.",
    ],
  },
  {
    version: "1.22.1",
    date: "2026-10-12",
    title: "Stories shown as stories",
    changes: [
      "A Story (Instagram, Facebook, Meta or WhatsApp Status) is shown in the phone as Instagram shows one: the whole artwork on black, filling the screen, with the account name over the top and no likes or caption. Nothing at the top or bottom is cut off, at any window size, on the post's page and on the review link.",
    ],
  },
  {
    version: "1.22.0",
    date: "2026-10-12",
    title: "Alt Text, About, and artwork that shows at once",
    changes: [
      "The table has an Alt Text column after Copy, with a Copy Alt Text button, and the post window has Copy Alt Text under the Alt Text.",
      "A post's artwork shows with the page instead of a moment after it.",
      "A client's Discovery has an About box, first.",
    ],
  },
  {
    version: "1.21.5",
    date: "2026-10-12",
    title: "Room beside who's here",
    changes: ["On a project's page, the pictures of who else is there sit a little further from the Active and Archived pills."],
  },
  {
    version: "1.21.4",
    date: "2026-10-12",
    title: "Room around the copy buttons",
    changes: ["Copy Caption and Copy WIIFM on the table have a little more space above and below them."],
  },
  {
    version: "1.21.3",
    date: "2026-10-12",
    title: "A wider bell",
    changes: ["The notifications panel is a quarter wider, so each one reads on fewer lines."],
  },
  {
    version: "1.21.2",
    date: "2026-10-12",
    title: "A plainer message in the bell",
    changes: ["If deleting notifications ever fails, the bell says so in plain words rather than the database's."],
  },
  {
    version: "1.21.1",
    date: "2026-10-12",
    title: "Tick boxes on Read only",
    changes: ["In the bell, read notifications can be ticked on the Read tab only, where the select-all box says All."],
  },
  {
    version: "1.21.0",
    date: "2026-10-12",
    title: "Sort and clear the bell",
    changes: [
      "The bell has All, Unread and Read, each with how many there are.",
      "A filter icon narrows the bell to certain people, clients or both.",
      "Read notifications can be ticked, one by one or all at once, and deleted.",
    ],
  },
  {
    version: "1.20.0",
    date: "2026-10-12",
    title: "A tidier bell",
    changes: [
      "The bell lists Unread and Read separately.",
      "Settings → General → Notifications sets how long a notification stays once read: 30, 60 or 90 days. Unread ones always stay.",
      "Draft with Frank shows the post's name in its header, and names your workspace and the client rather than “your workspace” and “the client”.",
    ],
  },
  {
    version: "1.19.3",
    date: "2026-10-11",
    title: "A narrower WIIFM column",
    changes: ["The table's WIIFM Direction column starts as wide as Copy, now that it's a few short points."],
  },
  {
    version: "1.19.2",
    date: "2026-10-11",
    title: "Copy from the table, and a sharper WIIFM",
    changes: [
      "The table's Copy column has a Copy Caption button at the end of the caption (after Read more, for a long one), and the WIIFM Direction column a Copy WIIFM button.",
      "The Copy column no longer shows Alt Text.",
      "The WIIFM Direction lists only what's working in the copy, in 3 to 5 short points, each naming the psychology principle or bias it uses.",
    ],
  },
  {
    version: "1.19.1",
    date: "2026-10-11",
    title: "A roomier Draft with Frank, a clearer Copy column",
    changes: [
      "Draft with Frank is wider, with a line between its two sides, and “Frank reads” is headed like “Earlier conversations”.",
      "The table's Copy column shows the caption as it is, without a “Caption:” label; any other field follows after a blank line, its name in bold.",
    ],
  },
  {
    version: "1.19.0",
    date: "2026-10-11",
    title: "Choose what Frank reads",
    changes: [
      "Each client's Preferences has a Draft with Frank section: whether Frank reads the client's Approved posts, and from how far back (3, 6 or 12 months, or all time), and the same for the client's comments (30, 90 or 180 days, or all time).",
      "Frank now reads only the client's Approved posts, never drafts the client hasn't signed off.",
      "Draft with Frank lists what Frank reads, with this client's choices, and earlier conversations scroll once there are many.",
    ],
  },
  {
    version: "1.18.5",
    date: "2026-10-11",
    title: "Copy Caption",
    changes: [
      "A Copy Caption button under the caption copies it with its line breaks and paragraphs, ready to paste into Instagram or another platform.",
      "Draft with Frank is in the post window's footer, so it's always in reach while you scroll.",
      "The Save and Copy buttons in the post window all sit the same distance below what's above them.",
    ],
  },
  {
    version: "1.18.4",
    date: "2026-10-11",
    title: "The rail names the client straight away",
    changes: ["Opening a client, project or post page, the left rail shows the client's name as soon as the page appears, with no gap while it loads."],
  },
  {
    version: "1.18.3",
    date: "2026-10-11",
    title: "Column headers that stay put",
    changes: [
      "On a planner or Other Content table, the column headers stay in view as you scroll through the posts, and everything above the table stays where it is.",
      "Each week's label stays at the left as the table scrolls sideways.",
      "The left rail names the client's page as its projects: No Fluff Projects, NuHabit Projects.",
    ],
  },
  {
    version: "1.18.2",
    date: "2026-10-11",
    title: "A clearer post page, and buttons that swipe",
    changes: [
      "On a post's page, the stage pills are a little larger and the dividers in the bar above the post a little taller.",
      "“No artwork yet” in the phone reads at the same size as the comments' “No comments”, with a larger picture above it; the review link's phone matches.",
      "Save Copy is greyed out until there's a change to save.",
      "Blue buttons turn a soft greyed blue on hover, and every button's hover colour now swipes in from the side your pointer comes in.",
      "The left rail names the client's planner: No Fluff Planner, Casa Carigar Planner.",
    ],
  },
  {
    version: "1.18.1",
    date: "2026-10-11",
    title: "Draft with Frank remembers what you used",
    changes: [
      "In Draft with Frank, a suggestion you've used still says Added when you open it again, as long as the editor holds its words; change any of them and it goes back to Use This.",
    ],
  },
  {
    version: "1.18.0",
    date: "2026-10-10",
    title: "A VO for video posts, and Frank knows the client better",
    changes: [
      "A video post (Reels, Stories, YouTube and other video formats) has a VO section after its Creative, for the voiceover script, with its own Save VO.",
      "The project table has a VO column, before Text on Image; only your team sees it.",
      "Draft with Frank writes a VO for a video post too, with its own Use This.",
      "Draft with Frank reads the client's other posts, Approved ones first, to keep to their voice, and follows what the client has asked for in comments over the last 90 days.",
      "Adding a row to the table shows a bar above it, like the one for selected posts: “1 added”, with Cancel and Save.",
      "The new row's date and time fit their columns again; click anywhere in them to pick.",
    ],
  },
  {
    version: "1.17.5",
    date: "2026-10-10",
    title: "Deleted messages go",
    changes: [
      "In a project's Discussion, a deleted message now goes completely, its reply box too. Only a deleted message that others have replied to leaves a line saying so, to keep the replies in place.",
    ],
  },
  {
    version: "1.17.4",
    date: "2026-10-10",
    title: "A chat icon for the Discussion",
    changes: ["A project's Discussion opens from a chat icon after the Active and Archived pills, in the same grey as the “…” beside it."],
  },
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
