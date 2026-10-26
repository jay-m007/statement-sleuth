// Turns positioned PDF text into table rows. Pure functions, so they can be tested without a PDF.
// Input: pages = [[{str, x, y, w, h}, ...], ...]  (x,y = left/baseline in PDF points, y grows upward)

const DATE_LIKE = /^(\d{1,2}[\/\-. ](\d{1,2}|[A-Za-z]{3,9})[\/\-. ,]+\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4})/;
const NUMERIC = /^[-(]?[^\w\s]{0,3}\s?\d[\d,]*(\.\d+)?\)?(\s?(Dr|Cr|DR|CR)\.?)?-?$/;
const HEADER_DATE = /\bdate\b/i;
const HEADER_DESC = /(description|narration|particulars|details|remarks|payee|merchant|transaction)/i;
const HEADER_AMT = /(debit|credit|withdrawal|deposit|amount|amt|balance|\bdr\b|\bcr\b)/i;

/** Group items into lines (top to bottom), each a list of cells {text, x0, x1} (left to right). */
export function toLines(items) {
  const its = items.filter((i) => i.str && i.str.trim()).map((i) => ({ ...i, h: i.h || 8 }));
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of its) {
    const tol = Math.max(2, it.h * 0.45);
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) { line.items.push(it); } else lines.push({ y: it.y, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of l.items) {
      const last = cells[cells.length - 1];
      const gap = last ? it.x - last.x1 : Infinity;
      const space = Math.max(it.h * 0.9, 4.5);
      if (last && gap < space) {
        last.text += (gap > it.h * 0.12 ? " " : "") + it.str.trim();
        last.x1 = Math.max(last.x1, it.x + it.w);
      } else cells.push({ text: it.str.trim(), x0: it.x, x1: it.x + it.w });
    }
    return { y: l.y, cells };
  });
}

function findHeader(lines) {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].cells.map((c) => c.text);
    const joined = t.join(" ");
    if (t.length >= 3 && HEADER_DATE.test(joined) && HEADER_DESC.test(joined) && HEADER_AMT.test(joined)) return i;
  }
  return -1;
}

const isNumeric = (s) => NUMERIC.test(s.trim());

function assign(cells, cols) {
  const row = cols.map(() => "");
  for (const c of cells) {
    let best = -1, bestD = Infinity;
    const num = isNumeric(c.text);
    cols.forEach((col, i) => {
      if (num && !col.amountish) return;
      const d = num ? Math.abs(c.x1 - col.x1) : Math.min(Math.abs(c.x0 - col.x0), Math.abs((c.x0 + c.x1) / 2 - (col.x0 + col.x1) / 2));
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) best = cols.reduce((b, col, i) => (Math.abs(c.x0 - col.x0) < Math.abs(c.x0 - cols[b].x0) ? i : b), 0);
    row[best] = row[best] ? row[best] + " " + c.text : c.text;
  }
  return row;
}

export function layoutToRows(pages) {
  const allLines = pages.flatMap((p) => toLines(p));
  const hi = findHeader(allLines);
  if (hi < 0) {
    // No recognisable header: hand back raw gap-separated rows so the normal "could not find columns" message appears.
    return allLines.map((l) => l.cells.map((c) => c.text));
  }
  const headerCells = allLines[hi].cells;
  const cols = headerCells.map((c) => ({ ...c, amountish: HEADER_AMT.test(c.text) && !HEADER_DESC.test(c.text) && !HEADER_DATE.test(c.text) }));
  const header = headerCells.map((c) => c.text);
  const headerKey = header.join("|").toLowerCase();
  const dateCol = Math.max(0, header.findIndex((h) => HEADER_DATE.test(h)));
  const descCol = Math.max(0, header.findIndex((h) => HEADER_DESC.test(h)));
  const rows = [header];
  let prev = null, prevDate = "";
  for (let i = hi + 1; i < allLines.length; i++) {
    const cells = allLines[i].cells;
    if (cells.map((c) => c.text).join("|").toLowerCase() === headerKey) continue; // header repeated on each page
    const row = assign(cells, cols);
    const hasDate = DATE_LIKE.test(row[dateCol] || "");
    const hasAmount = row.some((v, k) => cols[k].amountish && v && isNumeric(v));
    if (hasDate) {
      prev = row; prevDate = row[dateCol]; rows.push(row);
    } else if (hasAmount && row[descCol] && prevDate) {
      row[dateCol] = prevDate; prev = row; rows.push(row);          // same-day follow-on line with the date left blank
    } else if (prev && !hasAmount && row[descCol]) {
      prev[descCol] = (prev[descCol] + " " + row[descCol]).trim();   // wrapped description
    }
  }
  return rows;
}
