// Minimal ZIP reader (enough for .xlsx, .docx, .ods). Uses the built-in DecompressionStream, so no libraries.

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open zipped documents. Use a recent Chrome, Edge, Firefox or Safari, or save the file as CSV.");
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Returns { names, read(name) -> Promise<string|undefined> }. */
export function openZip(buffer) {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This file is not a valid document (it is damaged or not the format its name says).");
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
    const nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), off = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nlen));
    entries.set(name, { method, csize, usize, off });
    p += 46 + nlen + xlen + clen;
  }
  async function read(name) {
    const e = entries.get(name);
    if (!e) return undefined;
    if (e.usize > 60e6) throw new Error("That document is too large to open here. Try a shorter date range.");
    const nlen = u16(b, e.off + 26), xlen = u16(b, e.off + 28);
    const start = e.off + 30 + nlen + xlen;
    const data = b.subarray(start, start + e.csize);
    const out = e.method === 0 ? data : e.method === 8 ? await inflateRaw(data) : null;
    if (!out) throw new Error("This document uses a compression method that is not supported.");
    return new TextDecoder("utf-8").decode(out);
  }
  return { names: [...entries.keys()], read };
}
