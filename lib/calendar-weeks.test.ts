// Run with: node --experimental-strip-types --test lib/calendar-weeks.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { getMonthWeeks, getWeekDays, getMonthGridDays, isoWeekNumber, dateKey } from "./calendar-weeks.ts";

test("getMonthWeeks — September 2026 starts on the Monday before the 1st and ends on the Sunday after the 30th", () => {
  const weeks = getMonthWeeks(2026, 8); // month is 0-indexed: 8 = September
  const first = weeks[0][0];
  const last = weeks[weeks.length - 1][6];
  assert.equal(dateKey(first), "2026-08-31"); // Sept 1 2026 is a Tuesday
  assert.equal(dateKey(last), "2026-10-04"); // Sept 30 2026 is a Wednesday
  weeks.forEach((week) => assert.equal(week.length, 7));
});

test("getMonthWeeks — every week is Monday through Sunday", () => {
  const weeks = getMonthWeeks(2026, 8);
  for (const week of weeks) {
    assert.equal(week[0].getDay(), 1, "first day of week is Monday");
    assert.equal(week[6].getDay(), 0, "last day of week is Sunday");
  }
});

test("isoWeekNumber — matches the prototype's own worked example (week 36 is 31 Aug - 6 Sep 2026, week 37 is 7-13 Sep)", () => {
  assert.equal(isoWeekNumber(new Date(2026, 7, 31)), 36); // Monday, start of week 36
  assert.equal(isoWeekNumber(new Date(2026, 8, 1)), 36); // Tuesday, still week 36
  assert.equal(isoWeekNumber(new Date(2026, 8, 6)), 36); // Sunday, end of week 36
  assert.equal(isoWeekNumber(new Date(2026, 8, 7)), 37); // Monday, start of week 37
});

test("dateKey — zero-pads month and day", () => {
  assert.equal(dateKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("getWeekDays — returns the Mon-Sun week containing the given date", () => {
  const days = getWeekDays(new Date(2026, 8, 9)); // Wednesday 9 Sep 2026
  assert.equal(days.length, 7);
  assert.equal(dateKey(days[0]), "2026-09-07"); // Monday
  assert.equal(dateKey(days[6]), "2026-09-13"); // Sunday
});

test("getWeekDays — a Monday is already the start of its own week", () => {
  const days = getWeekDays(new Date(2026, 8, 7));
  assert.equal(dateKey(days[0]), "2026-09-07");
});

test("getMonthGridDays — September 2026 fills exactly 5 weeks (35 days), no trailing all-October week", () => {
  const days = getMonthGridDays(2026, 8);
  assert.equal(days.length, 35);
  assert.equal(dateKey(days[0]), "2026-08-31");
  assert.equal(dateKey(days[days.length - 1]), "2026-10-04");
});

test("getMonthGridDays — a month needing a 6th week keeps all 42 days", () => {
  // March 2026 (1 Mar is a Sunday) needs a 6th week to reach the Saturday
  // after the 31st.
  const days = getMonthGridDays(2026, 2);
  assert.equal(days.length, 42);
  const last = days[days.length - 1];
  assert.equal(last.getMonth(), 3); // spills into April
});
