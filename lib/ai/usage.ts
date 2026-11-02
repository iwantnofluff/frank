// Settings → AI Governance → Credit Usage: this month's AI requests against
// the workspace's allowance, by day, feature and person. The month is UTC,
// the same month runAiTask counts against the cap.

export interface UsageRow {
  created_at: string;
  user_id: string;
  task: string | null;
}

export interface UsageSummary {
  used: number;
  // One entry per day of the month, the 1st first; days after today are
  // marked future.
  byDay: { day: number; requests: number; future: boolean }[];
  // Most first. A null task is a request from before features were recorded.
  byTask: { task: string | null; requests: number }[];
  byPerson: { userId: string; requests: number }[];
  // The first day of next month, when the allowance resets.
  resetsOn: Date;
}

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function summariseUsage(rows: UsageRow[], now: Date): UsageSummary {
  const start = monthStart(now);
  const resetsOn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const today = now.getUTCDate();
  const days = new Date(resetsOn.getTime() - 1).getUTCDate();
  const byDay = Array.from({ length: days }, (_, i) => ({ day: i + 1, requests: 0, future: i + 1 > today }));
  const tasks = new Map<string | null, number>();
  const people = new Map<string, number>();
  let used = 0;
  for (const r of rows) {
    const at = new Date(r.created_at);
    if (at < start || at >= resetsOn) continue;
    used++;
    const d = at.getUTCDate();
    byDay[d - 1].requests++;
    tasks.set(r.task, (tasks.get(r.task) ?? 0) + 1);
    people.set(r.user_id, (people.get(r.user_id) ?? 0) + 1);
  }
  const most = <K>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1]);
  return {
    used,
    byDay,
    byTask: most(tasks).map(([task, requests]) => ({ task, requests })),
    byPerson: most(people).map(([userId, requests]) => ({ userId, requests })),
    resetsOn,
  };
}
