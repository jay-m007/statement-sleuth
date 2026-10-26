// Word (.docx) reader: tables become rows; if there is no table, each paragraph is split on tabs or wide gaps.
import { openZip } from "./zip.js";
import { elements, unescapeXml } from "./xml.js";

function paraText(xml) {
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g;
  let m;
  while ((m = re.exec(xml))) out += m[1] !== undefined ? unescapeXml(m[1]) : m[0].startsWith("<w:tab") ? "\t" : " ";
  return out;
}

export async function readDocx(buffer) {
  const zip = openZip(buffer);
  const xml = await zip.read("word/document.xml");
  if (!xml) throw new Error("This is not a Word document (.docx).");
  const sheets = [];
  // tables (a statement is almost always one big table; outer tables only, nested ones are flattened into cell text)
  for (const t of elements(xml, "w:tbl")) {
    const rows = [];
    for (const tr of elements(t.inner, "w:tr")) {
      const row = elements(tr.inner, "w:tc").map((tc) => elements(tc.inner, "w:p").map((p) => paraText(p.inner)).join(" ").replace(/\s+/g, " ").trim());
      if (row.some((x) => x !== "")) rows.push(row);
    }
    if (rows.length) sheets.push({ name: "Table " + (sheets.length + 1), rows });
  }
  // fallback: plain paragraphs
  const body = xml.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g, "");
  const lines = elements(body, "w:p").map((p) => paraText(p.inner)).filter((l) => l.trim());
  if (lines.length) {
    const rows = lines.map((l) => (l.includes("\t") ? l.split(/\t+/) : l.split(/\s{2,}/)).map((x) => x.trim()));
    sheets.push({ name: "Text", rows });
  }
  if (!sheets.length) throw new Error("That document has no text or tables in it.");
  return sheets;
}
