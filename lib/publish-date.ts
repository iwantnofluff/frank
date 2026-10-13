// A post's date in brackets after its name (direct instruction), e.g. "16
// Oct 26": in a scheduled project its Publish Date, in a continuous one its
// Live Date (a plain date, read as the day it names, not shifted by time
// zone). Null when it has none. A review link's list and the previous and
// next post on a post's page use it.
export function publishDate(
  delivery: "scheduled" | "continuous" | null | undefined,
  scheduledAt: string | null | undefined,
  dueOn: string | null | undefined,
): string | null {
  const at = delivery === "continuous" ? (dueOn ? `${dueOn}T00:00:00` : null) : (scheduledAt ?? null);
  if (!at) return null;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}
