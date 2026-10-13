// Whether a post has gone live (direct instruction, chosen over a fifth
// stage): Approved, and its date has passed. That's its Publish Date, or a
// continuous project's Live Date (from the start of that day). The same
// moment artwork removal counts from (lib/artwork-removal.ts). Nothing is
// stored; it's worked out each time.
// Whether a post not yet live is past its date (direct instruction: its
// date in red in the Feed): its Publish Date gone by, or a continuous
// project's Live Date over (from the day after). A live post isn't late.
export function isOverdue(
  post: { stage: number; scheduled_at: string | null; due_on?: string | null },
  now: number = Date.now(),
): boolean {
  if (isLive(post, now)) return false;
  const end = post.scheduled_at
    ? new Date(post.scheduled_at).getTime()
    : post.due_on
      ? new Date(`${post.due_on}T23:59:59.999`).getTime()
      : null;
  return end !== null && end < now;
}

export function isLive(
  post: { stage: number; scheduled_at: string | null; due_on?: string | null },
  now: number = Date.now(),
): boolean {
  if (post.stage < 4) return false;
  const at = post.scheduled_at ?? (post.due_on ? `${post.due_on}T00:00:00` : null);
  return !!at && new Date(at).getTime() <= now;
}
