// Tiny XML helpers (no DOMParser, so the same code runs in browsers and in Node tests).

export function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
    return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e.toLowerCase()];
  });
}
export function attr(tag, name) {
  const m = tag.match(new RegExp("(?:^|[\\s<])" + name.replace(/[:.]/g, "\\$&") + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')"));
  return m ? unescapeXml(m[1] ?? m[2]) : undefined;
}
/** All elements <name ...>...</name> or <name .../>, as {open, inner}. Does not handle same-name nesting (not needed here). */
export function elements(xml, name) {
  const out = [];
  const re = new RegExp("<" + name + "(?=[\\s>/])([^>]*?)(/>|>([\\s\\S]*?)</" + name + ">)", "g");
  let m;
  while ((m = re.exec(xml))) out.push({ open: m[1], inner: m[3] ?? "" });
  return out;
}
/** Concatenated text of every <name>…</name> inside xml. */
export function textOf(xml, name) {
  return elements(xml, name).map((e) => unescapeXml(e.inner)).join("");
}
