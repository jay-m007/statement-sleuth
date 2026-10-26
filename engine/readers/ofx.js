// OFX / QFX (most banks and Quicken/Money) and QIF readers. Output is already in the app's column shape.

const HEADER = ["Date", "Description", "Amount"];

function ofxDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec((s || "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
export function readOfx(text) {
  const rows = [HEADER];
  const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTTRNRS>|$)/gi;
  const tag = (blk, t) => { const m = new RegExp("<" + t + ">([^<\\r\\n]*)", "i").exec(blk); return m ? m[1].trim() : ""; };
  let m;
  while ((m = re.exec(text))) {
    const blk = m[1];
    const date = ofxDate(tag(blk, "DTPOSTED"));
    const amt = tag(blk, "TRNAMT").replace(/,/g, ".").replace(/\.(?=.*\.)/g, "");
    const desc = [tag(blk, "NAME"), tag(blk, "MEMO")].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" ");
    if (date && amt) rows.push([date, desc.replace(/&amp;/g, "&"), amt]);
  }
  if (rows.length === 1) throw new Error("No transactions found in that OFX/QFX file.");
  return [{ name: "OFX", rows }];
}
export function readQif(text) {
  const rows = [HEADER];
  let cur = {};
  const push = () => { if (cur.D && cur.T) rows.push([cur.D, [cur.P, cur.M].filter(Boolean).join(" "), cur.T]); cur = {}; };
  for (const line of String(text).split(/\r?\n/)) {
    if (!line) continue;
    const c = line[0], v = line.slice(1).trim();
    if (c === "^") push();
    else if ("DTPM".includes(c)) cur[c] = c === "D" ? v.replace(/'/g, "/").replace(/\s+/g, "") : v;
  }
  push();
  if (rows.length === 1) throw new Error("No transactions found in that QIF file.");
  return [{ name: "QIF", rows }];
}
