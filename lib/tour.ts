import { useSyncExternalStore } from "react";
import type { AgencyRole } from "@/lib/roles";

// Frank Tour (phase144, direct instruction): a short guided look at the
// basics, the page dimmed around one thing at a time, Next to move on. A
// tour per kind of person: Owners and Admins set up, Users do the work,
// clients review it. Shown once on someone's first visit, and replayable
// from Frank Tour in the account menu.

export type TourKind = "admin" | "user" | "client";

// Where a step is shown: the page it needs, or wherever the person is.
export type TourPlace = "here" | "dashboard" | "client" | "project" | "post" | "team";

export interface TourStep {
  id: string;
  place: TourPlace;
  // What to light up, the first found; none for a card in the middle.
  spot?: string[];
  // Only for someone who can invite people (Owners, and Admins let to).
  invites?: boolean;
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
  body: "Replay this any time from Frank Tour in your menu. Help, the ? at the top, has the rest.",
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
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function useTouring() {
  return useSyncExternalStore(
    subscribe,
    () => touring,
    () => false,
  );
}

// Frank Tour in the menu starts it with this.
export const TOUR_START_EVENT = "frank:tour-start";

// Set in a browser to keep the tour from starting on its own there (the
// end-to-end tests' accounts are all new); Frank Tour still starts it.
export const TOUR_AUTO_OFF_KEY = "frank:tour-auto-off";
