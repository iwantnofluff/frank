// The admin area's one style for dates and numbers (decided directly,
// 2 Nov 2026): "2 Nov 2026" everywhere, never the browser's own (which
// gave "11/2/2026" on one page and "Nov 2, 2026" on the next), and
// thousands with a comma.

const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function day(value: string | Date | null | undefined, empty = "never"): string {
  return value ? new Date(value).toLocaleDateString("en-GB", DAY) : empty;
}

// "2 Nov, 14:05".
export function dayTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function num(n: number): string {
  return n.toLocaleString("en");
}

// "$1,234", or with cents below $100 ("$12.40", "$0.03"), where they matter.
export function money(n: number): string {
  return n < 100 && n !== Math.round(n)
    ? `$${n.toFixed(2)}`
    : `$${Math.round(n).toLocaleString("en")}`;
}

// "Nov 2026" from "2026-11".
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}
