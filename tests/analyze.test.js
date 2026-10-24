import test from "node:test";
import assert from "node:assert/strict";
import { analyze, feeLetter, duplicateLetter } from "../engine/index.js";
import { sampleStatement } from "../engine/sample.js";

const TODAY = "2026-10-25";
const r = analyze(sampleStatement(TODAY), { asOf: TODAY });

test("sample statement: finds the planted fees, nothing more", () => {
  assert.deepEqual(r.fees.map((f) => f.id), ["atm", "overdraft", "sms", "minbal", "bounce", "minbal", "sms", "late", "foreign"]);
  assert.equal(r.feeSummary.refundedTotal, 354);
  assert.equal(r.feeSummary.likely, 1340); // overdraft 500+90 and late fee 750
});

test("sample statement: finds the planted subscriptions, not the everyday spending", () => {
  const names = r.subs.map((s) => s.name).sort();
  assert.deepEqual(names, ["Gym", "Jio", "JioHotstar", "Landlord Ramesh", "Netflix", "Spotify", "YouTube Premium", "iCloud"].sort());
  assert.equal(r.subs.find((s) => s.name === "JioHotstar").stopped, true);
  assert.ok(r.subs.find((s) => s.name === "YouTube Premium").priceChange);
});

test("sample statement: demo always has renewals due within three days", () => {
  const soon = r.subs.filter((s) => s.nextDue && s.nextDue <= "2026-10-28").map((s) => s.name);
  assert.ok(soon.includes("Spotify"));
});

test("sample statement: one duplicate charge", () => {
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].desc, "UPI/ZOMATO/ORDER 77");
});

test("the demo stays correct on other dates", () => {
  for (const d of ["2026-01-31", "2027-03-01", "2028-02-29"]) {
    const x = analyze(sampleStatement(d), { asOf: d });
    assert.ok(x.subs.find((s) => s.name === "Netflix"), d);
    assert.ok(x.fees.length >= 8, d);
  }
});

test("letters mention the amount, the date, and the ask", () => {
  const fee = r.fees.find((f) => f.id === "overdraft");
  const text = feeLetter(fee, { name: "Jay", bank: "HDFC Bank", account: "4821" });
  assert.match(text, /₹590\.00/);
  assert.match(text, /HDFC Bank/);
  assert.match(text, /one-time goodwill refund/);
  assert.match(text, /first time/);
  assert.match(text, /₹500\.00 fee plus ₹90\.00 tax/);
  assert.doesNotMatch(text, /\bRBI\b|\blaw\b|legal action/i, "no legal threats or claims");
  assert.match(duplicateLetter(r.duplicates[0]), /two identical debits/);
});

test("repeat fees get a different opening line", () => {
  const second = r.fees.filter((f) => f.id === "minbal")[1];
  assert.match(feeLetter(second), /appeared before/);
});
