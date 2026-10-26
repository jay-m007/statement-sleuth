// OpenDocument spreadsheet (.ods, from LibreOffice) reader.
import { openZip } from "./zip.js";
import { attr, elements, unescapeXml } from "./xml.js";

export async function readOds(buffer) {
  const zip = openZip(buffer);
  const xml = await zip.read("content.xml");
  if (!xml) throw new Error("This is not an OpenDocument spreadsheet (.ods).");
  const sheets = [];
  for (const t of elements(xml, "table:table")) {
    const rows = [];
    for (const r of elements(t.inner, "table:table-row")) {
      const rrep = Math.min(+(attr(r.open, "table:number-rows-repeated") || 1), 50);
      const row = [];
      for (const c of elements(r.inner.replace(/<table:covered-table-cell[^>]*\/>/g, "<table:table-cell/>"), "table:table-cell")) {
        const crep = Math.min(+(attr(c.open, "table:number-columns-repeated") || 1), 50);
        const type = attr(c.open, "office:value-type");
        let val = "";
        if (type === "date") val = (attr(c.open, "office:date-value") || "").slice(0, 10);
        else if (type === "float" || type === "currency" || type === "percentage") val = attr(c.open, "office:value") || "";
        else val = elements(c.inner, "text:p").map((p) => unescapeXml(p.inner.replace(/<[^>]+>/g, ""))).join(" ");
        for (let i = 0; i < crep; i++) row.push(val.trim());
      }
      while (row.length && row[row.length - 1] === "") row.pop();
      if (row.some((x) => x !== "")) for (let i = 0; i < rrep; i++) rows.push(row.slice());
    }
    if (rows.length) sheets.push({ name: attr(t.open, "table:name") || "Sheet", rows });
  }
  if (!sheets.length) throw new Error("That spreadsheet has no data in it.");
  return sheets;
}
