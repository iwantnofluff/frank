// Ported from the prototype's renderList()/renderWeek()/tableRows() week
// math exactly: Mon-Sun weeks spanning the full calendar month (including
// the lead-in/trailing days from adjacent months needed to complete the
// first and last week), the single Mon-Sun week containing a given date,
// and the ISO 8601 week number shown on each week's band.
export function getMonthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));

  const weeks: Date[][] = [];
  for (const cursor = new Date(start); cursor <= last; cursor.setDate(cursor.getDate() + 7)) {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(cursor);
      dt.setDate(cursor.getDate() + i);
      days.push(dt);
    }
    weeks.push(days);
  }
  return weeks;
}

export function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    days.push(dt);
  }
  return days;
}

// The 42-cell (6 full weeks) month grid for "Calendar" mode, trimmed to 35
// (5 weeks) when the 6th week is entirely outside the month — same
// trimming rule as the prototype's renderCal().
export function getMonthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  let days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    days.push(dt);
  }
  while (days.length > 35 && days[35].getMonth() !== month) {
    days = days.slice(0, 35);
  }
  return days;
}

export function isoWeekNumber(date: Date): number {
  const t = new Date(date);
  t.setDate(t.getDate() + 4 - ((t.getDay() + 6) % 7));
  return Math.ceil(((t.getTime() - new Date(t.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
}

// Local calendar-day key (YYYY-MM-DD) — creatives are grouped into a
// week's day by the same local calendar date a person would read off a
// scheduled_at timestamp, not by its UTC instant.
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
