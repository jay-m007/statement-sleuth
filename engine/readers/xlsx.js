// Excel (.xlsx / .xlsm) reader -> list of sheets, each a list of rows of strings.
import { openZip } from "./zip.js";
import { attr, elements, textOf, unescapeXml } from "./xml.js";

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || "");
  if (!m) return -1;
  let n = 0;
  for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
export function serialToISO(n) {
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function isDateFormat(code) {
  const c = String(code).replace(/\[[^\]]*\]|"[^"]*"|\\./g, "");
  return /[dmyh]/i.test(c) && !/^(general|0|#)/i.test(c.trim());
}
function plainNumber(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return String(Math.round(n * 1e6) / 1e6);
}

export async function readXlsx(buffer) {
  const zip = openZip(buffer);
  const wb = await zip.read("xl/workbook.xml");
  if (!wb) throw new Error("This is not an Excel workbook (.xlsx).");
  const rels = (await zip.read("xl/_rels/workbook.xml.rels")) || "";
  const relTarget = {};
  for (const r of elements(rels, "Relationship")) relTarget[attr(r.open, "Id")] = attr(r.open, "Target");

  const shared = [];
  const ss = await zip.read("xl/sharedStrings.xml");
  if (ss) for (const si of elements(ss, "si")) shared.push(textOf(si.inner.replace(/<rPh[\s\S]*?<\/rPh>/g, ""), "t"));

  const dateFmtIds = new Set(BUILTIN_DATE_FMTS);
  const styles = await zip.read("xl/styles.xml");
  const xfIsDate = [];
  if (styles) {
    const custom = {};
    for (const f of elements(styles, "numFmt")) custom[attr(f.open, "numFmtId")] = attr(f.open, "formatCode");
    for (const [id, code] of Object.entries(custom)) if (isDateFormat(code)) dateFmtIds.add(+id);
    const cellXfs = elements(styles, "cellXfs")[0];
    if (cellXfs) for (const x of elements(cellXfs.inner, "xf")) xfIsDate.push(dateFmtIds.has(+attr(x.open, "numFmtId")));
  }

  const sheets = [];
  for (const s of elements(wb, "sheet")) {
    const rid = attr(s.open, "r:id");
    let target = relTarget[rid] || "worksheets/sheet" + (sheets.length + 1) + ".xml";
    target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.?\//, "");
    const xml = await zip.read(target);
    if (!xml) continue;
    const rows = [];
    for (const r of elements(xml, "row")) {
      const row = [];
      for (const c of elements(r.inner, "c")) {
        const ref = attr(c.open, "r"), t = attr(c.open, "t");
        const idx = colIndex(ref) >= 0 ? colIndex(ref) : row.length;
        const vm = c.inner.match(/<v>([\s\S]*?)<\/v>/);
        const v = vm ? unescapeXml(vm[1]) : "";
        let val = "";
        if (t === "s") val = shared[+v] ?? "";
        else if (t === "inlineStr") val = textOf(c.inner, "t");
        else if (t === "str" || t === "e") val = v;
        else if (t === "b") val = v === "1" ? "TRUE" : "FALSE";
        else if (v !== "") {
          const si = +(attr(c.open, "s") ?? -1);
          val = xfIsDate[si] && Number(v) > 0 && Number(v) < 2958466 ? serialToISO(Number(v)) : plainNumber(v);
        }
        while (row.length < idx) row.push("");
        row[idx] = String(val).trim();
      }
      if (row.some((x) => x !== "")) rows.push(row);
      if (rows.length > 200000) break;
    }
    sheets.push({ name: attr(s.open, "name") || "Sheet" + (sheets.length + 1), rows });
  }
  if (!sheets.length) throw new Error("That workbook has no sheets.");
  return sheets;
}
