import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV, parseDate, parseAmount, readStatement } from "../engine/csv.js";

test("parseCSV handles quotes, commas inside quotes, CRLF and BOM", () => {
  const rows = parseCSV('﻿a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"']]);
});

test("parseCSV sniffs semicolons and tabs", () => {
  assert.deepEqual(parseCSV("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCSV("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});

test("parseDate reads common formats day-first by default", () => {
  assert.equal(parseDate("05/03/2026"), "2026-03-05");
  assert.equal(parseDate("05/03/2026", "mdy"), "2026-05-03");
  assert.equal(parseDate("25/12/26"), "2026-12-25");
  assert.equal(parseDate("12/25/2026"), "2026-12-25"); // 25 can only be a day
  assert.equal(parseDate("2026-03-05"), "2026-03-05");
  assert.equal(parseDate("5 Mar 2026"), "2026-03-05");
  assert.equal(parseDate("05-Mar-26"), "2026-03-05");
  assert.equal(parseDate("Mar 5, 2026"), "2026-03-05");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("hello"), null);
});

test("parseAmount reads signs, symbols, brackets, Dr/Cr and commas", () => {
  assert.equal(parseAmount("1,234.50"), 1234.5);
  assert.equal(parseAmount("-45"), -45);
  assert.equal(parseAmount("(500.00)"), -500);
  assert.equal(parseAmount("₹1,299.00 Dr"), -1299);
  assert.equal(parseAmount("Rs. 99"), 99);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("n/a"), null);
});

test("readStatement: Indian bank with junk above the header and Debit/Credit columns", () => {
  const csv = `Account Statement\nCustomer: A B\nDate,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/04/26,UPI-NETFLIX,123,01/04/26,649.00,,1000\n02/04/26,SALARY,,02/04/26,,5000.00,6000\n`;
  const r = readStatement(csv);
  assert.equal(r.txns.length, 2);
  assert.deepEqual(r.txns.map((t) => t.amount), [-649, 5000]);
  assert.equal(r.txns[0].date, "2026-04-01");
});

test("readStatement: single signed Amount column (US style)", () => {
  const csv = `Transaction Date,Description,Amount\n2026-01-03,NETFLIX.COM,-15.49\n2026-01-04,PAYROLL,2000\n`;
  const r = readStatement(csv);
  assert.deepEqual(r.txns.map((t) => t.amount), [-15.49, 2000]);
});

test("readStatement: credit-card file where spending is positive gives a hint, and the flag flips signs", () => {
  const csv = `Date,Description,Amount\n2026-01-03,A SHOP,10\n2026-01-04,B SHOP,20\n2026-01-05,C SHOP,30\n2026-01-06,D SHOP,40\n`;
  assert.equal(readStatement(csv).hint, "spendingPositive");
  assert.ok(readStatement(csv, { spendingPositive: true }).txns.every((t) => t.amount < 0));
});

test("readStatement explains what is wrong", () => {
  assert.throws(() => readStatement(""), /empty/);
  assert.throws(() => readStatement("foo,bar\n1,2"), /Could not find the columns/);
  assert.throws(() => readStatement("Date,Description,Amount\nx,y,z"), /no usable rows/);
});
