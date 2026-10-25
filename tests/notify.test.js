import test from "node:test";
import assert from "node:assert/strict";
import { planNotifications, hashId } from "../engine/notify.js";

const spotify = { id: "spotify", name: "Spotify", amount: 119, cadence: "monthly", nextDue: "2026-11-10", remind: true };
const today = "2026-10-25";

test("one notification per reminder time, at 9 am local", () => {
  const n = planNotifications([spotify], { today, leadDays: [3, 1], horizonDays: 30 });
  assert.deepEqual(n.map((x) => x.at), ["2026-11-07T09:00:00", "2026-11-09T09:00:00"]);
  assert.equal(n[1].title, "Spotify renews tomorrow");
  assert.match(n[1].body, /^₹119 monthly/);
});

test("repeats for later renewals inside the horizon, keeping the day of month", () => {
  const n = planNotifications([{ ...spotify, nextDue: "2026-01-31" }], { today: "2026-01-20", leadDays: [0], horizonDays: 100 });
  assert.deepEqual(n.map((x) => x.at.slice(0, 10)), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("skips subscriptions the user turned off or that have no date", () => {
  assert.equal(planNotifications([{ ...spotify, remind: false }], { today }).length, 0);
  assert.equal(planNotifications([{ ...spotify, nextDue: null }], { today }).length, 0);
  assert.equal(planNotifications([{ ...spotify, cadence: "daily" }], { today }).length, 0);
});

test("a reminder whose time has already passed today is dropped, tomorrow's is kept", () => {
  const p = [{ ...spotify, nextDue: "2026-10-25" }];
  assert.equal(planNotifications(p, { today, leadDays: [0], nowMinutes: 10 * 60, horizonDays: 10 }).length, 0);
  assert.equal(planNotifications(p, { today, leadDays: [0], nowMinutes: 8 * 60, horizonDays: 10 }).length, 1);
  const q = [{ ...spotify, nextDue: "2026-10-26" }];
  assert.equal(planNotifications(q, { today, leadDays: [1], nowMinutes: 10 * 60, horizonDays: 10 }).length, 0, "1 day before 26th is today 9am, already passed");
  assert.equal(planNotifications(q, { today, leadDays: [0], nowMinutes: 10 * 60, horizonDays: 10 }).length, 1);
});

test("never schedules in the past or beyond the horizon", () => {
  const n = planNotifications([{ ...spotify, cadence: "weekly" }], { today, leadDays: [1, 0], horizonDays: 14 });
  for (const x of n) { assert.ok(x.at.slice(0, 10) >= today); assert.ok(x.at.slice(0, 10) <= "2026-11-08"); }
});

test("caps the total so the phone's pending-notification limit is never hit", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ ...spotify, id: "s" + i, name: "S" + i, cadence: "weekly" }));
  assert.equal(planNotifications(many, { today, leadDays: [3, 1, 0] }).length, 60);
});

test("ids are stable integers, unique per renewal and reminder time", () => {
  const a = planNotifications([spotify], { today, leadDays: [3, 1], horizonDays: 60 });
  const b = planNotifications([spotify], { today, leadDays: [3, 1], horizonDays: 60 });
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.equal(new Set(a.map((x) => x.id)).size, a.length);
  for (const x of a) assert.ok(Number.isInteger(x.id) && x.id > 0 && x.id < 2147483647);
  assert.equal(hashId("x"), hashId("x"));
});

test("junk input does not throw", () => {
  assert.deepEqual(planNotifications(null, { today }), []);
  assert.deepEqual(planNotifications([null, {}, { remind: true }], { today }), []);
  assert.equal(planNotifications([spotify], { today, leadDays: [-1, 99, 1.5, "x"] }).length, 0);
});

test("dollar amounts use the chosen currency", () => {
  const n = planNotifications([{ ...spotify, amount: 9.99 }], { today, leadDays: [1], currency: "$" });
  assert.match(n[0].body, /^\$9\.99 monthly/);
});
