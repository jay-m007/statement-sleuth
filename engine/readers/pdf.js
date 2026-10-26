// PDF reader. pdf.js (Mozilla, Apache-2.0) is loaded only when a PDF is chosen, from this site's own files.
import { layoutToRows } from "./pdf-layout.js";

const here = import.meta.url;

export class PdfError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export async function readPdf(buffer, { password, pdfjs } = {}) {
  if (!pdfjs) {
    pdfjs = await import(new URL("../../vendor/pdfjs/pdf.min.js", here).href);
    try { pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdfjs/pdf.worker.min.js", here).href; } catch { /* worker falls back to the main thread */ }
  }
  const data = new Uint8Array(buffer.byteLength ? buffer : new Uint8Array(buffer));
  const task = pdfjs.getDocument({ data, password: password || undefined, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  let doc;
  try { doc = await task.promise; } catch (e) {
    if (e && e.name === "PasswordException") {
      throw new PdfError(e.code === 2 ? "PDF_WRONG_PASSWORD" : "PDF_PASSWORD", e.code === 2 ? "That password did not work." : "This PDF is password protected.");
    }
    throw new PdfError("PDF_BAD", "Could not open that PDF. It may be damaged.");
  }
  const pages = [];
  let chars = 0;
  try {
    const n = Math.min(doc.numPages, 80);
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = [];
      for (const it of tc.items) {
        if (typeof it.str !== "string") continue;
        const t = it.transform;
        items.push({ str: it.str, x: t[4], y: t[5], w: it.width, h: Math.hypot(t[2], t[3]) || it.height || 8 });
        chars += it.str.trim().length;
      }
      pages.push(items);
    }
  } finally { try { await doc.destroy(); } catch { /* ignore */ } }
  if (chars < 20) throw new PdfError("PDF_SCAN", "This PDF has no selectable text, so it is probably a scan or a photo. Download the text version (or CSV) from your bank instead.");
  return [{ name: "PDF", rows: layoutToRows(pages) }];
}
