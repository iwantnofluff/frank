import { stageLabel } from "./stage-labels.ts";

// One line of a project's Activity log (phase84): who did it, what they
// did (around the post's name, which the panel links), in plain words.
export interface ActivityInput {
  kind: string;
  by_name: string | null;
  creative_name: string | null;
  detail: Record<string, unknown>;
}

export interface ActivityLine {
  // Null when the line names nobody (a link turned off).
  who: string | null;
  // The words before and after the post's name; no post: `before` only.
  before: string;
  after?: string;
}

const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(", ") : "");
const quote = (v: unknown) => (typeof v === "string" && v.trim() ? `: “${v.trim()}”` : "");

export function activityLine(row: ActivityInput): ActivityLine {
  const d = row.detail ?? {};
  // Nobody signed in (done by Frank itself, or before people were
  // recorded): "Someone", so the line still reads as a sentence.
  const who = row.by_name ?? "Someone";
  switch (row.kind) {
    case "post_created":
      return { who, before: "added " };
    case "stage": {
      const to = Number(d.to);
      if (d.exception === "changes_requested") return { who, before: "asked for changes on " };
      if (d.exception === "rejected") return { who, before: "rejected " };
      if (to === 4) return { who: row.by_name ?? "The client", before: "approved " };
      if (Number(d.from) === 4) return { who, before: "took back the approval of " };
      return { who, before: "moved ", after: ` to ${stageLabel(to, "scheduled")}` };
    }
    case "artwork_version":
      return { who, before: `uploaded artwork V${d.version} for ` };
    case "copy_version":
      return { who, before: `saved copy V${d.version} for ` };
    case "comment":
      return { who: row.by_name ?? "A guest", before: d.internal ? "left an internal comment on " : "commented on ", after: quote(d.text) };
    case "comment_resolved":
      return { who, before: "resolved a comment on ", after: quote(d.text) };
    case "link_shared":
      return row.creative_name ? { who, before: "shared ", after: " for review" } : { who, before: "shared a review link" };
    case "link_revoked":
      return row.creative_name
        ? { who: null, before: "The review link for ", after: " was turned off" }
        : { who: null, before: "A review link was turned off" };
    case "post_edited":
      return { who, before: "edited ", after: d.fields ? `: ${list(d.fields)}` : "" };
    case "post_archived":
      return { who, before: "archived " };
    case "post_restored":
      return { who, before: "restored " };
    case "post_deleted":
      return { who, before: "deleted " };
    case "project_renamed":
      return { who, before: `renamed the project from “${d.from}” to “${d.to}”` };
    case "project_details":
      return { who, before: `changed the project's ${list(d.fields)}` };
    case "project_archived":
      return { who, before: "archived the project" };
    case "project_restored":
      return { who, before: "restored the project" };
    case "project_folder":
      return { who, before: d.folder ? `moved the project to the ${d.folder} folder` : "took the project out of its folder" };
    case "project_client":
      return { who, before: `moved the project from ${d.from ?? "another client"} to ${d.to ?? "another client"}` };
    case "person_added":
      return { who, before: `gave ${d.person ?? "someone"} access` };
    case "person_removed":
      return { who, before: `took away ${d.person ?? "someone"}'s access` };
    default:
      return { who, before: "made a change" };
  }
}

// Whether a line is about a post (and so names it).
export function namesPost(kind: string, creativeName: string | null): boolean {
  if (!creativeName) return false;
  return !kind.startsWith("project_") && !kind.startsWith("person_");
}
