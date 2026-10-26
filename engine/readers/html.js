// HTML tables (some banks export statements as .html or .htm).
import { elements, unescapeXml } from "./xml.js";

export function readHtml(text) {
  const clean = String(text).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, "");
  const sheets = [];
  for (const t of elements(clean, "table")) {
    const rows = [];
    for (const tr of elements(t.inner, "tr")) {
      const cells = [...tr.inner.matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/gi)].map((m) => unescapeXml(m[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
      if (cells.some((x) => x !== "")) rows.push(cells);
    }
    if (rows.length) sheets.push({ name: "Table " + (sheets.length + 1), rows });
  }
  if (!sheets.length) throw new Error("No table found in that web page.");
  return sheets;
}
