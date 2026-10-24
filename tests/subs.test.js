import test from "node:test";
import assert from "node:assert/strict";
import { merchantKey, findSubscriptions, nextDue, upcoming, subscriptionInsights } from "../engine/subs.js";
import { addMonths } from "../engine/dates.js";

const t = (date, desc, amount) => ({ date, desc, amount });
const monthly = (desc, amt, start, n) => Array.from({ length: n }, (_, i) => t(addMonths(start, i), desc, -amt));

test("merchantKey maps bank noise to a stable name", () => {
  assert.equal(merchantKey("UPI/4021/NETFLIX.COM/ref77"), "known:Netflix");
  assert.equal(merchantKey("SPOTIFY INDIA PVT LTD MUMBAI"), "known:Spotify");
  assert.equal(merchantKey("POS 4111 JOES CAFE MUMBAI"), "raw:joes cafe");
  assert.equal(merchantKey("1234567"), "");
});

test("finds a monthly subscription and predicts next due date", () => {
  const txns = monthly("NETFLIX.COM", 649, "2026-05-10", 4); // 10 May .. 10 Aug
  const [s] = findSubscriptions(txns, "2026-08-20");
  assert.equal(s.name, "Netflix");
  assert.equal(s.cadence, "monthly");
  assert.equal(s.nextDue, "2026-09-10");
  assert.equal(s.stopped, false);
  assert.equal(s.yearly, 7788);
});

test("handles month ends: 31 Jan then 28 Feb then 31 Mar", () => {
  assert.equal(nextDue("2026-01-31", "monthly", "2026-02-01"), "2026-02-28");
  assert.equal(nextDue("2026-01-31", "monthly", "2026-03-01"), "2026-03-31");
});

test("tolerates a few days of drift (weekends)", () => {
  const txns = [t("2026-01-10", "SPOTIFY", -119), t("2026-02-12", "SPOTIFY", -119), t("2026-03-10", "SPOTIFY", -119), t("2026-04-13", "SPOTIFY", -119)];
  assert.equal(findSubscriptions(txns, "2026-04-20")[0].cadence, "monthly");
});

test("needs two charges for known services but three steady ones for unknown merchants", () => {
  assert.equal(findSubscriptions(monthly("NETFLIX", 649, "2026-05-10", 2), "2026-07-01").length, 1);
  assert.equal(findSubscriptions(monthly("JOES CLUB", 800, "2026-05-10", 2), "2026-07-01").length, 0);
  assert.equal(findSubscriptions(monthly("JOES CLUB", 800, "2026-05-10", 3), "2026-07-20").length, 1);
});

test("everyday spending with varying amounts is not a subscription", () => {
  const txns = [t("2026-01-05", "SWIGGY ORDER", -212), t("2026-02-04", "SWIGGY ORDER", -640), t("2026-03-06", "SWIGGY ORDER", -95), t("2026-04-05", "SWIGGY ORDER", -380)];
  // "swiggy" alone is not in the known list, amounts vary wildly
  assert.equal(findSubscriptions(txns, "2026-04-10").length, 0);
});

test("two charges the same day count once", () => {
  const txns = [t("2026-05-10", "NETFLIX", -649), t("2026-05-10", "NETFLIX", -649)];
  assert.equal(findSubscriptions(txns, "2026-05-20").length, 0);
});

test("quarterly and yearly cadences", () => {
  const q = [t("2026-01-15", "JIO RECHARGE", -899), t("2026-04-15", "JIO RECHARGE", -899), t("2026-07-14", "JIO RECHARGE", -899)];
  assert.equal(findSubscriptions(q, "2026-07-20")[0].cadence, "quarterly");
  const y = [t("2025-03-01", "ADOBE", -4000), t("2026-03-01", "ADOBE", -4200)];
  const [s] = findSubscriptions(y, "2026-03-05");
  assert.equal(s.cadence, "yearly");
  assert.equal(s.nextDue, "2027-03-01");
});

test("flags a price change", () => {
  const txns = [...monthly("YOUTUBE PREMIUM", 129, "2026-01-03", 3), t("2026-04-03", "YOUTUBE PREMIUM", -149)];
  const [s] = findSubscriptions(txns, "2026-04-10");
  assert.deepEqual(s.priceChange, { from: 129, to: 149, date: "2026-04-03" });
  assert.match(subscriptionInsights([s]).join(" "), /went from 129 to 149/);
});

test("a subscription that stopped charging is marked stopped and has no due date", () => {
  const txns = [...monthly("HOTSTAR", 299, "2026-01-05", 3), t("2026-08-01", "SOMETHING ELSE", -10)];
  const [s] = findSubscriptions(txns, "2026-08-02");
  assert.equal(s.stopped, true);
  assert.equal(s.nextDue, null);
});

test("overlap note for two music services", () => {
  const txns = [...monthly("SPOTIFY", 119, "2026-01-05", 3), ...monthly("GAANA", 99, "2026-01-07", 3)];
  assert.match(subscriptionInsights(findSubscriptions(txns, "2026-03-20")).join(" "), /2 music services/);
});

test("upcoming lists only what is due inside the window, soonest first", () => {
  const txns = [...monthly("NETFLIX", 649, "2026-01-10", 3), ...monthly("SPOTIFY", 119, "2026-01-12", 3), ...monthly("ICLOUD", 75, "2026-01-25", 3)];
  const subs = findSubscriptions(txns, "2026-03-13");
  const u = upcoming(subs, "2026-04-09", 3);
  assert.deepEqual(u.map((x) => [x.sub.name, x.daysLeft]), [["Netflix", 1], ["Spotify", 3]]);
  assert.equal(upcoming(subs, "2026-04-09", 0).length, 0);
});
