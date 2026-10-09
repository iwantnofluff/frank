// Fire-and-forget: sends the emails a client's comment or approval is owed
// (app/api/notify/client-activity, phase80), called right after one lands
// from every place a client can comment or approve. Never awaited, never
// shown: the comment's own success doesn't wait on mail. Anything the
// database didn't mark as owed is simply not sent.
export function notifyClientActivity(creativeId: string): void {
  fetch("/api/notify/client-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creativeId }),
  }).catch(() => {
    // Best-effort; the notice is still in the bell.
  });
}
