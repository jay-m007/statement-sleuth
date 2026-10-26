import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readDocument } from "../engine/readers/index.js";
import { readStatement } from "../engine/csv.js";
import { layoutToRows } from "../engine/readers/pdf-layout.js";
import { serialToISO } from "../engine/readers/xlsx.js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (n) => new Uint8Array(readFileSync(join(dir, n)));
const spend = (res) => res.txns.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0);

// Every format must give the same 12 transactions.
const SAME = ["statement.csv", "statement.tsv", "statement.xlsx", "statement.docx", "statement.ods", "statement.html", "statement.ofx", "statement.qif", "statement.pdf", "statement-utf16.csv", "statement-cp1252.csv"];
for (const f of SAME) {
  test("reads " + f, async () => {
    const { rows } = await readDocument(f, load(f), { pdfjs });
    const r = readStatement(rows, { dateOrder: "dmy" });
    assert.equal(r.txns.length, 12, f + " transaction count");
    assert.equal(r.txns[0].date, "2026-09-01");
    assert.equal(r.txns[11].date, "2026-11-05");
    assert.equal(Math.round(spend(r) * 100) / 100, -4119, f + " total spent");
    assert.ok(r.txns.some((t) => /OVERDRAFT/.test(t.desc) && t.amount === -500), f + " overdraft fee");
  });
}

test("pdf: wrapped description lines are joined to their transaction", async () => {
  const { rows } = await readDocument("statement.pdf", load("statement.pdf"), { pdfjs });
  const late = rows.find((r) => /LATE PAYMENT/.test(r.join(" ")));
  assert.match(late.join(" "), /CARD ENDING 0042/);
});
test("pdf: password protected asks for a password, then opens", async () => {
  await assert.rejects(readDocument("l.pdf", load("statement-locked.pdf"), { pdfjs }), (e) => e.code === "PDF_PASSWORD");
  await assert.rejects(readDocument("l.pdf", load("statement-locked.pdf"), { pdfjs, password: "nope" }), (e) => e.code === "PDF_WRONG_PASSWORD");
  const { rows } = await readDocument("l.pdf", load("statement-locked.pdf"), { pdfjs, password: "secret123" });
  assert.equal(readStatement(rows).txns.length, 12);
});
test("xlsx: picks the sheet that looks like a statement and converts date serials", async () => {
  const { rows } = await readDocument("x.xlsx", load("statement.xlsx"));
  assert.equal(rows[0].length >= 5 || rows[3].length >= 5, true);
  assert.equal(serialToISO(46266), "2026-09-01");
});
test("friendly errors for formats we cannot read", async () => {
  await assert.rejects(readDocument("a.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3])), /Save as/);
  await assert.rejects(readDocument("a.jpg", new Uint8Array([0xff, 0xd8, 0xff, 1, 2])), /Photos|Download/);
  await assert.rejects(readDocument("a.csv", new Uint8Array([])), /empty/);
  await assert.rejects(readDocument("a.docx", new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), /(ZIP|valid)/i);
});
test("pdf layout: statement without a header returns raw rows (no crash)", () => {
  const rows = layoutToRows([[{ str: "hello", x: 10, y: 700, w: 30, h: 9 }, { str: "world", x: 200, y: 700, w: 30, h: 9 }]]);
  assert.deepEqual(rows, [["hello", "world"]]);
});
test("pdf layout: blank-date follow-on line inherits the date", () => {
  const mk = (t, x, y, w = 40) => ({ str: t, x, y, w, h: 9 });
  const rows = layoutToRows([[
    mk("Date", 40, 700, 20), mk("Description", 110, 700, 50), mk("Debit", 330, 700, 25), mk("Balance", 420, 700, 35),
    mk("01/09/2026", 40, 680, 50), mk("AAA SHOP", 110, 680, 45), mk("10.00", 345, 680, 25), mk("90.00", 455, 680, 25),
    mk("BBB SHOP", 110, 665, 45), mk("5.00", 350, 665, 20), mk("85.00", 455, 665, 25),
  ]]);
  assert.equal(rows.length, 3);
  assert.equal(rows[2][0], "01/09/2026");
});
