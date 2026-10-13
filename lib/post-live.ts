// Whether a post has gone live (direct instruction, chosen over a fifth
// stage): Approved, and its date has passed. That's its Publish Date, or a
// continuous project's Live Date (from the start of that day). The same
// moment artwork removal counts from (lib/artwork-removal.ts). Nothing is
// stored; it's worked out each time.
export function isLive(
  post: { stage: number; scheduled_at: string | null; due_on?: string | null },
  now: number = Date.now(),
): boolean {
  if (post.stage < 4) return false;
  const at = post.scheduled_at ?? (post.due_on ? `${post.due_on}T00:00:00` : null);
  return !!at && new Date(at).getTime() <= now;
}
