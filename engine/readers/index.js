// One entry point for every supported file type. Returns the table of rows ready for readStatement().
import { parseCSV, detectColumns } from "../csv.js";
import { openZip } from "./zip.js";
import { readXlsx } from "./xlsx.js";
import { readDocx } from "./docx.js";
import { readOds } from "./ods.js";
import { readHtml } from "./html.js";
import { readOfx, readQif } from "./ofx.js";
import { readPdf } from "./pdf.js";

export const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,.ods,.docx,.pdf,.ofx,.qfx,.qif,.html,.htm,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const SUPPORTED_TEXT = "CSV, Excel (.xlsx), Word (.docx), PDF, OpenDocument (.ods), OFX/QFX, QIF, TSV, TXT or HTML";

const startsWith = (b, s) => s.split("").every((c, i) => b[i] === c.charCodeAt(0));

/** Decode bytes to text: UTF-8 (with or without BOM), UTF-16 (BOM), or Windows-1252 as a last resort. */
export function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

async function sniff(name, bytes) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  if (startsWith(bytes, "%PDF-")) return "pdf";
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return ext === "doc" ? "olddoc" : "oldxls";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let names = [];
    try { names = openZip(bytes).names; } catch { /* fall through */ }
    if (names.some((n) => n.startsWith("xl/"))) return "xlsx";
    if (names.some((n) => n.startsWith("word/"))) return "docx";
    if (names.includes("content.xml")) return "ods";
    return "zip";
  }
  if (["ofx", "qfx"].includes(ext)) return "ofx";
  if (ext === "qif") return "qif";
  if (["html", "htm"].includes(ext)) return "html";
  if (["xls", "doc", "pages", "numbers", "rtf", "jpg", "jpeg", "png", "heic", "gif", "zip"].includes(ext)) return ext;
  // content sniffing for text files that lost their extension
  const head = decodeText(bytes.subarray(0, 600));
  if (/<OFX>|OFXHEADER/i.test(head)) return "ofx";
  if (/^!Type:/m.test(head)) return "qif";
  if (/<table[\s>]/i.test(head)) return "html";
  return "text";
}

const FRIENDLY = {
  oldxls: "That is an old Excel file (.xls). Open it in Excel and choose Save as, then pick Excel Workbook (.xlsx) or CSV.",
  xls: "That is an old Excel file (.xls). Open it in Excel and choose Save as, then pick Excel Workbook (.xlsx) or CSV.",
  olddoc: "That is an old Word file (.doc). Open it in Word and choose Save as, then pick Word Document (.docx).",
  doc: "That is an old Word file (.doc). Open it in Word and choose Save as, then pick Word Document (.docx).",
  jpg: "Photos and screenshots cannot be read. Download the statement as CSV, Excel or PDF from your bank.", jpeg: "Photos and screenshots cannot be read. Download the statement as CSV, Excel or PDF from your bank.",
  png: "Photos and screenshots cannot be read. Download the statement as CSV, Excel or PDF from your bank.", heic: "Photos cannot be read. Download the statement as CSV, Excel or PDF from your bank.",
  gif: "Images cannot be read. Download the statement as CSV, Excel or PDF from your bank.",
  zip: "That is a ZIP file. Unzip it first, then choose the statement inside.",
  rtf: "RTF is not supported. Save it as .docx or CSV first.", pages: "Apple Pages is not supported. Export it as PDF or Word first.", numbers: "Apple Numbers is not supported. Export it as Excel or CSV first.",
};

/** Pick the sheet that actually looks like a statement (the first one with Date + Description + Amount columns). */
function bestSheet(sheets) {
  for (const s of sheets) if (detectColumns(s.rows)) return s;
  return sheets.reduce((a, b) => (b.rows.length > a.rows.length ? b : a), sheets[0]);
}

/**
 * bytes: Uint8Array of the file. Returns { rows, kind }.
 * Throws Error with a plain message; a PDF that needs a password throws an error with code PDF_PASSWORD / PDF_WRONG_PASSWORD.
 */
export async function readDocument(name, bytes, opts = {}) {
  if (!bytes || !bytes.length) throw new Error("That file looks empty.");
  const kind = await sniff(String(name || ""), bytes);
  if (FRIENDLY[kind]) throw new Error(FRIENDLY[kind]);
  switch (kind) {
    case "pdf": return { kind, rows: bestSheet(await readPdf(bytes, opts)).rows };
    case "xlsx": return { kind, rows: bestSheet(await readXlsx(bytes)).rows };
    case "docx": return { kind, rows: bestSheet(await readDocx(bytes)).rows };
    case "ods": return { kind, rows: bestSheet(await readOds(bytes)).rows };
    case "ofx": return { kind, rows: readOfx(decodeText(bytes))[0].rows };
    case "qif": return { kind, rows: readQif(decodeText(bytes))[0].rows };
    case "html": return { kind, rows: bestSheet(readHtml(decodeText(bytes))).rows };
    default: return { kind: "csv", rows: parseCSV(decodeText(bytes)) };
  }
}
