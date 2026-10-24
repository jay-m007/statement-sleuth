import test from "node:test";
import assert from "node:assert/strict";
import { findFees, findDuplicates, summariseFees } from "../engine/fees.js";

const t = (date, desc, amount) => ({ date, desc, amount });

test("recognises each kind of fee", () => {
  const cases = [
    ["OVERDRAFT FEE", "overdraft"], ["NSF FEE", "overdraft"], ["ATM WDL CHG OTHER BANK", "atm"], ["MIN BAL CHARGES - AMB", "minbal"],
    ["LATE PAYMENT FEE", "late"], ["SMS ALERT CHARGES", "sms"], ["FOREX MARKUP FEE", "foreign"], ["CARD ANNUAL FEE", "annual"],
    ["CHEQUE RETURN CHARGES", "bounce"], ["FINANCE CHARGES", "interest"], ["ACCOUNT MAINTENANCE FEE", "maintenance"],
  ];
  for (const [desc, id] of cases) assert.equal(findFees([t("2026-01-01", desc, -100)])[0]?.id, id, desc);
});

test("ignores normal spending and money coming in", () => {
  assert.equal(findFees([t("2026-01-01", "SWIGGY ORDER", -300), t("2026-01-02", "OVERDRAFT FEE REVERSAL", 500), t("2026-01-03", "SALARY", 5000)]).length, 0);
});

test("attaches GST to its fee and does not count it twice", () => {
  const fees = findFees([t("2026-01-01", "OVERDRAFT FEE", -500), t("2026-01-01", "GST ON OD FEE", -90)]);
  assert.equal(fees.length, 1);
  assert.equal(fees[0].amount, 500);
  assert.equal(fees[0].gst, 90);
  assert.equal(fees[0].total, 590);
});

test("a big unrelated debit is not mistaken for GST", () => {
  const fees = findFees([t("2026-01-01", "ATM FEE", -20), t("2026-01-01", "GST PAYMENT TO VENDOR", -5000)]);
  assert.equal(fees[0].gst, 0);
});

test("first time gets the better chance; repeats drop a level", () => {
  const fees = findFees([t("2026-01-01", "LATE PAYMENT FEE", -700), t("2026-02-01", "LATE PAYMENT FEE", -700), t("2026-03-01", "LATE PAYMENT FEE", -700)]);
  assert.deepEqual(fees.map((f) => f.chance), ["high", "medium", "low"]);
  assert.deepEqual(fees.map((f) => f.firstTime), [true, false, false]);
});

test("spots a fee that was already refunded", () => {
  const fees = findFees([t("2026-01-01", "CHEQUE RETURN CHARGES", -354), t("2026-01-08", "REFUND OF CHEQUE RETURN CHARGES", 354)]);
  assert.equal(fees[0].refunded, true);
  assert.equal(summariseFees(fees).open, 0);
  assert.equal(summariseFees(fees).refundedTotal, 354);
});

test("a refund of something else does not mark the fee refunded", () => {
  const fees = findFees([t("2026-01-01", "ATM FEE", -21), t("2026-01-08", "REFUND AMAZON", 999)]);
  assert.equal(fees[0].refunded, undefined);
});

test("unknown 'charge' lines are shown as Other, not hidden", () => {
  const fees = findFees([t("2026-01-01", "PROCESSING CHARGE XYZ", -45)]);
  assert.equal(fees[0].id, "other");
});

test("duplicates: same text and amount within two days", () => {
  const d = findDuplicates([t("2026-01-01", "ZOMATO 7", -389), t("2026-01-02", "ZOMATO 7", -389), t("2026-01-20", "ZOMATO 7", -389)]);
  assert.equal(d.length, 1);
  assert.equal(d[0].amount, 389);
});

test("two fees of the same size on the same day are not 'duplicates'", () => {
  assert.equal(findDuplicates([t("2026-01-01", "ATM FEE", -21), t("2026-01-01", "ATM FEE", -21)]).length, 0);
});

test("summary separates likely from worth-asking", () => {
  const s = summariseFees(findFees([t("2026-01-01", "OVERDRAFT FEE", -500), t("2026-01-02", "ATM FEE", -21), t("2026-01-03", "SMS CHARGES", -17)]));
  assert.equal(s.likely, 500);
  assert.equal(s.worthAsking, 521);
  assert.equal(s.total, 538);
});
