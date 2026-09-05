import { describe, it, expect } from "vitest";
import { deflateRawSync, crc32 } from "node:zlib";
import { readSheet } from "./xlsx.mjs";

/**
 * These exist because this reader shipped a real bug and nothing caught it.
 *
 * It was checked once, against openpyxl, on one of the six workbooks it
 * parses — and passed. Diffing all six later turned up four cells sitting one
 * column to the left of where they belong, in the only two rows in the whole
 * set where Excel wrote an empty cell as a self-closing tag. Every value was
 * still a number, every row still had the right length, and the province
 * totals were still right because the misplaced value stayed in its own row.
 *
 * A spreadsheet parser fails by producing plausible output, so the fixtures
 * below are built by hand around the shapes that break it rather than around
 * the shapes that work.
 */

/** Minimal ZIP with stored (uncompressed) entries — enough for readSheet. */
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, "utf8"));
    const raw = Buffer.from(text, "utf8");
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc32(raw), 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }
  const body = Buffer.concat(parts);
  const dir = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, dir, eocd]);
}

/** A workbook of one sheet, from raw <row> XML. */
const book = (rowsXml, sharedStrings = []) =>
  zip({
    "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet><sheetData>${rowsXml}</sheetData></worksheet>`,
    ...(sharedStrings.length
      ? {
          "xl/sharedStrings.xml": `<?xml version="1.0"?><sst>${sharedStrings
            .map((s) => `<si><t>${s}</t></si>`)
            .join("")}</sst>`,
        }
      : {}),
  });

describe("the empty-cell bug this reader shipped with", () => {
  it("does not let a self-closing cell swallow the next one", () => {
    /*
     * Excel writes a styled-but-empty cell as `<c r="B1" s="5"/>`. A greedy
     * attribute capture eats that trailing slash, so the `/>`  branch can no
     * longer match, the parse falls through to `>…</c>`, and it runs on to
     * the next cell's closing tag — carrying that cell's value back into the
     * empty one and shifting the rest of the row left.
     */
    const rows = book(
      `<row r="1"><c r="A1"><v>1</v></c><c r="B1" s="5"/><c r="C1"><v>3</v></c></row>`,
    );
    // null, not undefined: the cell is present and empty. A column that is
    // absent from the XML altogether stays a hole in the sparse row, which
    // is a different thing and the next test relies on it.
    expect(readSheet(rows)[0]).toEqual([1, null, 3]);
  });

  it("handles several empty cells in a row, and one at the end", () => {
    const rows = book(
      `<row r="1"><c r="A1" s="1"/><c r="B1" s="1"/><c r="C1"><v>7</v></c><c r="D1" s="1"/></row>`,
    );
    const row = readSheet(rows)[0];
    expect(row[2]).toBe(7);
    expect(row[0]).toBeNull();
    expect(row[1]).toBeNull();
  });

  it("still reads a cell with no attributes at all", () => {
    expect(readSheet(book(`<row r="1"><c><v>5</v></c><c><v>6</v></c></row>`))[0]).toEqual([5, 6]);
  });
});

describe("cells land in the column they claim", () => {
  it("keeps a gap open rather than shifting later cells left", () => {
    // The gap is the whole point: a value that slides one column left is read
    // under the wrong header and stays a plausible number.
    const row = readSheet(book(`<row r="1"><c r="A1"><v>1</v></c><c r="D1"><v>4</v></c></row>`))[0];
    expect(row[0]).toBe(1);
    expect(row[3]).toBe(4);
    expect(row[1]).toBeUndefined();
  });

  it("reads two-letter columns", () => {
    const row = readSheet(book(`<row r="1"><c r="AA1"><v>27</v></c><c r="AB1"><v>28</v></c></row>`))[0];
    expect(row[26]).toBe(27);
    expect(row[27]).toBe(28);
  });

  it("puts a row at the index its own r attribute gives", () => {
    const sheet = readSheet(book(`<row r="1"><c r="A1"><v>1</v></c></row><row r="3"><c r="A3"><v>3</v></c></row>`));
    expect(sheet).toHaveLength(3);
    expect(sheet[0][0]).toBe(1);
    expect(sheet[1]).toEqual([]);
    expect(sheet[2][0]).toBe(3);
  });
});

describe("values come back as the right type", () => {
  it("resolves shared strings, including ones split across runs", () => {
    const b = zip({
      "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>`,
      "xl/sharedStrings.xml": `<?xml version="1.0"?><sst><si><t>กรุงเทพมหานคร</t></si><si><r><t>ไฟฟ้า</t></r><r><t>ชั่วคราว</t></r></si></sst>`,
    });
    expect(readSheet(b)[0]).toEqual(["กรุงเทพมหานคร", "ไฟฟ้าชั่วคราว"]);
  });

  it("reads inline strings and unescapes entities", () => {
    const row = readSheet(
      book(`<row r="1"><c r="A1" t="inlineStr"><is><t>a &amp; b</t></is></c><c r="B1" t="str">x &lt; y</c></row>`),
    )[0];
    expect(row[0]).toBe("a & b");
  });

  it("keeps numbers as numbers, not strings", () => {
    const row = readSheet(book(`<row r="1"><c r="A1"><v>331689916.404</v></c><c r="B1"><v>0</v></c></row>`))[0];
    expect(row[0]).toBe(331689916.404);
    expect(row[1]).toBe(0);
    expect(typeof row[1]).toBe("number");
  });
});

describe("it refuses rather than guesses", () => {
  it("throws on something that is not a zip", () => {
    expect(() => readSheet(Buffer.from("not a spreadsheet"))).toThrow(/zip/i);
  });

  it("throws when the sheet is not where it was expected", () => {
    expect(() => readSheet(zip({ "xl/other.xml": "<x/>" }))).toThrow(/sheet1/);
  });
});
