import { STAGE } from "./stage-labels.ts";
// Whether a post has gone live: Live (phase99), or Approved and its date
// has passed (direct instruction, before Live was a stage). That's its Publish Date, a
// continuous project's too (phase140; its Due Date until it has one), from
// the start of that day. The same
// moment artwork removal counts from (lib/artwork-removal.ts). Nothing is
// stored; it's worked out each time.
// Whether a post not yet live is past its date (direct instruction: its
// date in red in the Feed): its Publish Date gone by, or a continuous
// project's Live Date over (from the day after). A live post isn't late.
// An Other Content post's go-live day: its Publish Date (phase140), else
// its Due Date until it has one.
export function goLiveDay(post: { due_on?: string | null; publish_on?: string | null }): string | null {
  return post.publish_on ?? post.due_on ?? null;
}

export function isOverdue(
  post: { stage: number; scheduled_at: string | null; due_on?: string | null; publish_on?: string | null },
  now: number = Date.now(),
): boolean {
  if (isLive(post, now)) return false;
  const day = goLiveDay(post);
  const end = post.scheduled_at
    ? new Date(post.scheduled_at).getTime()
    : day
      ? new Date(`${day}T23:59:59.999`).getTime()
      : null;
  return end !== null && end < now;
}

export function isLive(
  post: { stage: number; scheduled_at: string | null; due_on?: string | null; publish_on?: string | null },
  now: number = Date.now(),
): boolean {
  if (post.stage < STAGE.approved) return false;
  // Live (phase99): found on Instagram or set by hand, whatever its date.
  if (post.stage === STAGE.live) return true;
  const day = goLiveDay(post);
  const at = post.scheduled_at ?? (day ? `${day}T00:00:00` : null);
  return !!at && new Date(at).getTime() <= now;
}

// When a post really went live against the date it was planned for
// (phase99, direct instruction): on time if live that day or before, late
// from the day after, by the calendar in the viewer's own time zone. The
// planned date is a scheduled post's Publish Date, or a continuous
// project's Live Date (a plain date). Null with nothing to compare.
export function liveTiming(
  planned: { scheduled_at: string | null; due_on?: string | null; publish_on?: string | null },
  delivery: "scheduled" | "continuous" | null | undefined,
  liveAt: string,
): "on_time" | "late" | null {
  const day = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const plannedDay =
    delivery === "continuous"
      ? goLiveDay(planned)
        ? Number(goLiveDay(planned)!.replaceAll("-", ""))
        : null
      : planned.scheduled_at
        ? day(new Date(planned.scheduled_at))
        : null;
  if (plannedDay === null) return null;
  return day(new Date(liveAt)) <= plannedDay ? "on_time" : "late";
}

// An Other Content post whose work is overdue (phase140): its Due Date
// over (from the day after) and not yet Approved. Its Due Date shows red.
export function isPastDue(post: { stage: number; due_on?: string | null }, now: number = Date.now()): boolean {
  if (!post.due_on || post.stage >= STAGE.approved) return false;
  return new Date(`${post.due_on}T23:59:59.999`).getTime() < now;
}
