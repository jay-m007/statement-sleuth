import test from "node:test";
import assert from "node:assert/strict";
import { buildICS, trigger, googleCalendarLink } from "../engine/ics.js";

const sub = { name: "Netflix", amount: 649, cadence: "monthly", cadenceLabel: "monthly", nextDue: "2026-11-10", stopped: false };

test("alert offsets land at 9am", () => {
  assert.equal(trigger(0), "PT9H");
  assert.equal(trigger(1), "-PT15H");
  assert.equal(trigger(3), "-P2DT15H");
  assert.equal(trigger(7), "-P6DT15H");
});

test("builds a valid repeating all-day event with two alarms", () => {
  const ics = buildICS([sub], { now: new Date("2026-10-25T00:00:00Z") });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261110\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261111\r\n/);
  assert.match(ics, /RRULE:FREQ=MONTHLY\r\n/);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.match(ics, /TRIGGER:-P2DT15H/);
  assert.match(ics, /TRIGGER:-PT15H/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/\r\n/g) || []).length, ics.split("\n").length - 1, "all line endings are CRLF");
});

test("quarterly and yearly rules", () => {
  assert.match(buildICS([{ ...sub, cadence: "quarterly" }]), /RRULE:FREQ=MONTHLY;INTERVAL=3/);
  assert.match(buildICS([{ ...sub, cadence: "yearly" }]), /RRULE:FREQ=YEARLY/);
});

test("skips stopped subscriptions and escapes text", () => {
  assert.doesNotMatch(buildICS([{ ...sub, stopped: true, nextDue: null }]), /VEVENT/);
  assert.match(buildICS([{ ...sub, name: "A, B; C" }]), /SUMMARY:A\\, B\; C renews/);
});

test("long lines are folded to 75 bytes", () => {
  const ics = buildICS([{ ...sub, name: "X".repeat(200) }]);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line.length + "");
});

test("google calendar link carries only the name, amount and date", () => {
  const u = new URL(googleCalendarLink(sub));
  assert.equal(u.hostname, "calendar.google.com");
  assert.equal(u.searchParams.get("dates"), "20261110/20261111");
  assert.equal(u.searchParams.get("recur"), "RRULE:FREQ=MONTHLY");
});
