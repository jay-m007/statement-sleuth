// Small, forgiving CSV reader + column detection for bank statements.

/** Parse CSV text into rows of strings. Handles quotes, escaped quotes, CRLF, BOM. */
export function parseCSV(text, delimiter) {
  text = String(text).replace(/^﻿/, "");
  const d = delimiter || sniffDelimiter(text);
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === d) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

function sniffDelimiter(text) {
  const head = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let q = false;
  for (const c of head) {
    if (c === '"') q = !q;
    else if (!q && c in counts) counts[c]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

const DATE_H = /^(txn\s*date|transaction\s*date|value\s*date|posting\s*date|post\s*date|date|booking\s*date)/i;
const DESC_H = /(description|narration|particulars|details|memo|payee|merchant|transaction\s*remarks|remarks|reference)/i;
const DEBIT_H = /(debit|withdrawal|withdrawals|money\s*out|paid\s*out|dr\b)/i;
const CREDIT_H = /(credit|deposit|deposits|money\s*in|paid\s*in|cr\b)/i;
const AMOUNT_H = /^(amount|txn\s*amount|transaction\s*amount|amt)/i;
const BALANCE_H = /balance/i;

/**
 * Find the header row and map columns. Banks put junk lines above the header
 * (account name, period), so we look at the first 15 rows for one that has a date
 * column and a description column.
 */
export function detectColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const h = rows[r];
    const map = { date: -1, desc: -1, debit: -1, credit: -1, amount: -1, balance: -1 };
    h.forEach((cell, i) => {
      if (map.date < 0 && DATE_H.test(cell) && !/value/i.test(cell)) map.date = i;
      else if (map.balance < 0 && BALANCE_H.test(cell)) map.balance = i;
      else if (map.debit < 0 && DEBIT_H.test(cell) && !DESC_H.test(cell)) map.debit = i;
      else if (map.credit < 0 && CREDIT_H.test(cell) && !DESC_H.test(cell)) map.credit = i;
      else if (map.amount < 0 && AMOUNT_H.test(cell)) map.amount = i;
      else if (map.desc < 0 && DESC_H.test(cell)) map.desc = i;
    });
    if (map.date < 0) {
      // a "value date" only file
      const vi = h.findIndex((c) => /date/i.test(c));
      if (vi >= 0) map.date = vi;
    }
    const hasMoney = map.amount >= 0 || map.debit >= 0;
    if (map.date >= 0 && map.desc >= 0 && hasMoney) return { headerRow: r, ...map };
  }
  return null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Parse a date string to "YYYY-MM-DD" or null.
 * Slash dates are read day-first (India, UK) unless `order` is "mdy" or the
 * first number is > 12 / second > 12 makes it unambiguous.
 */
export function parseDate(s, order = "dmy") {
  s = String(s || "").trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-\/. ]([A-Za-z]{3})[a-z]*[-\/. ,]+(\d{2,4})/))) {
    const mo = MONTHS[m[2].toLowerCase()];
    return mo ? iso(fullYear(+m[3]), mo, +m[1]) : null;
  }
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/))) {
    const mo = MONTHS[m[1].toLowerCase()];
    return mo ? iso(+m[3], mo, +m[2]) : null;
  }
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) {
    let a = +m[1], b = +m[2];
    const y = fullYear(+m[3]);
    let day, mon;
    if (a > 12) { day = a; mon = b; }
    else if (b > 12) { day = b; mon = a; }
    else if (order === "mdy") { mon = a; day = b; }
    else { day = a; mon = b; }
    return iso(y, mon, day);
  }
  return null;
}
function fullYear(y) { return y < 100 ? 2000 + y : y; }
function iso(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/** Parse "1,234.50", "(500.00)", "Rs. 99", "₹1,299.00 Dr", "-45" into a signed number or null. */
export function parseAmount(s) {
  s = String(s ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) neg = true;
  if (/(^|\s)-|-$/.test(s)) neg = true;
  if (/\bdr\.?$/i.test(s)) neg = true;
  const t = s.replace(/[^0-9.,]/g, "").replace(/^[.,]+/, "");
  if (!/\d/.test(t)) return null;
  // European style 1.234,56 vs 1,234.56
  let n;
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(t) || /^\d+,\d{1,2}$/.test(t)) n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  else n = parseFloat(t.replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

/**
 * Turn raw CSV text into transactions: {date, desc, amount} where amount < 0 is money going out.
 * Returns {txns, skipped, columns} or throws Error with a plain-language message.
 */
export function readStatement(text, opts = {}) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error("That file looks empty.");
  const cols = detectColumns(rows);
  if (!cols) {
    throw new Error("Could not find the columns. The file needs a Date column, a Description (or Narration) column, and either Amount or Debit/Credit columns.");
  }
  const txns = [];
  let skipped = 0;
  for (let i = cols.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[cols.date], opts.dateOrder);
    const desc = (r[cols.desc] || "").replace(/\s+/g, " ").trim();
    let amount = null;
    if (cols.debit >= 0 || cols.credit >= 0) {
      const d = cols.debit >= 0 ? parseAmount(r[cols.debit]) : null;
      const c = cols.credit >= 0 ? parseAmount(r[cols.credit]) : null;
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
    } else {
      amount = parseAmount(r[cols.amount]);
      // Credit-card style files list purchases as positive numbers.
      if (amount !== null && opts.spendingPositive) amount = -amount;
    }
    if (!date || !desc || amount === null) { skipped++; continue; }
    txns.push({ date, desc, amount: round2(amount), row: i + 1 });
  }
  const negatives = txns.filter((t) => t.amount < 0).length;
  const hint = cols.amount >= 0 && cols.debit < 0 && negatives === 0 && txns.length > 3 && !opts.spendingPositive
    ? "spendingPositive" : null;
  if (!txns.length) throw new Error("Found the columns but no usable rows. Check the date and amount formats.");
  txns.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row));
  return { txns, skipped, columns: cols, hint };
}

export function round2(n) { return Math.round(n * 100) / 100; }
