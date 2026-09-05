/**
 * Read the cells out of an .xlsx, without a dependency.
 *
 * The energy ministry publishes provincial electricity as .xlsx and nothing
 * else — no CSV for the per-year files. Every other script here runs on the
 * standard library alone, and a spreadsheet parser is a large amount of
 * surface to take on for one build step, so this reads only what is actually
 * needed: a ZIP directory, one worksheet, and the shared string table.
 *
 * What it does not do is as important as what it does. No formulas, no dates,
 * no styles, no streaming. If a file needs any of that, this will read it
 * wrong rather than complain, so the caller is expected to check the numbers
 * against something — see how fetch-province-electricity.mjs cross-checks the
 * national total.
 */
import { inflateRawSync } from "node:zlib";

/**
 * Entries of a ZIP archive, by name.
 *
 * Walks the central directory rather than scanning for local headers: a local
 * header can declare sizes of zero and defer them to a trailing data
 * descriptor, in which case there is no way to know where the entry ends
 * without the directory. The directory always has the real sizes.
 */
function unzip(buf) {
  // The end-of-central-directory record sits at the very end, unless the file
  // carries a comment, so scan backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory entry ${n}`);
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // The local header's own name and extra lengths can differ from the
    // directory's — the extra field in particular usually does — so read them
    // again here rather than reusing the values above.
    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const start = localAt + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressed);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** "BC12" → 12-based row and a zero-based column index. */
function cellRef(ref) {
  let col = 0;
  let i = 0;
  for (; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    col = col * 26 + (c - 64);
  }
  return { col: col - 1, row: +ref.slice(i) };
}

const UNESCAPE = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(\w+));/g, (m, dec, hex, name) =>
    dec ? String.fromCodePoint(+dec)
      : hex ? String.fromCodePoint(parseInt(hex, 16))
      : (UNESCAPE[name] ?? m),
  );

/**
 * Rows of the first worksheet as an array of arrays.
 *
 * Numbers come back as numbers and text as strings. Gaps are filled from each
 * cell's own reference, so a row that skips a column lines up with its
 * header rather than shifting left — the failure that turns a spreadsheet
 * into plausible nonsense.
 *
 * Empty is not the same as absent. A cell that exists but holds nothing comes
 * back as `null`; a column the row never mentions stays a hole in the sparse
 * array and reads as `undefined`. Callers that sum a row should treat both as
 * zero, but the distinction is kept because losing it is how a shifted column
 * stops being detectable.
 */
export function readSheet(buf, sheetPath = "xl/worksheets/sheet1.xml") {
  const files = unzip(buf);
  const sheet = files.get(sheetPath);
  if (!sheet) throw new Error(`no ${sheetPath} in workbook (has: ${[...files.keys()].slice(0, 8).join(", ")})`);

  // Shared strings: every distinct piece of text in the workbook, referenced
  // by index from cells marked t="s". A string may be split across several
  // <t> runs when parts of it are formatted differently, so join them.
  const shared = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) {
    for (const [, si] of ss.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(
        [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join(""),
      );
    }
  }

  const rows = [];
  for (const [, attrs, body] of sheet.toString("utf8").matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNum = +(/\br="(\d+)"/.exec(attrs)?.[1] ?? rows.length + 1);
    const row = [];
    // The attribute capture is lazy, and that is load-bearing. Greedy
    // `[^>]*` swallows the slash of a self-closing `<c r="L3"/>`, so the
    // `\/>` branch can no longer match and the parse falls through to
    // `>…</c>` — which then runs past the empty cell and eats the NEXT one.
    // The value of M3 arrives labelled L3, every later cell in the row shifts
    // one column left, and every number is still a number.
    //
    // Found by diffing all six workbooks against openpyxl rather than the one
    // that was checked when this was written: four cells across two files, in
    // the only two rows in the whole set where Excel emitted an empty cell
    // this way.
    for (const [, cAttrs, cBody] of body.matchAll(/<c([^>]*?)\s*(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cAttrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(cAttrs)?.[1];
      const col = ref ? cellRef(ref).col : row.length;
      let value = null;
      if (cBody) {
        if (type === "inlineStr") {
          value = [...cBody.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
        } else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(cBody)?.[1];
          if (v != null) {
            value = type === "s" ? (shared[+v] ?? null) : type === "str" ? decode(v) : Number(v);
          }
        }
      }
      row[col] = value;
    }
    rows[rowNum - 1] = row;
  }
  // A workbook can skip empty rows entirely; fill so indices mean row numbers.
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}
