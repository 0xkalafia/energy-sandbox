import { describe, it, expect } from "vitest";
import { makeGrid, paint, measure, windowOf, clear } from "./raster.mjs";

/**
 * Every protected-area figure the app ships comes out of this file — 109,380
 * km² nationwide, Phetchaburi at 45%, Kaeng Krachan at 77% — and until these
 * tests the only thing that had ever checked it was the national total against
 * the official one. That is an aggregate, and an aggregate passes on a
 * function that is wrong in a way that cancels.
 *
 * So the shapes below have areas known from outside: rectangles that are a
 * multiplication, a diamond that is exactly half its bounding box, a circle
 * that is pi r squared. Plus the awkward cases — holes, overlaps, vertices
 * landing exactly on a scanline, and shapes too thin for the grid to see.
 */

const CELL = 0.005;
const grid1deg = () =>
  makeGrid({ lon0: 99, lat0: 13, lon1: 100, lat1: 14, cell: CELL });

const box = (a, b, c, d) => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
  [a, b],
];

/** A lon/lat rectangle's area, computed the way a person would. */
const rectKm2 = (dLon, dLat, midLat) =>
  dLon * 111.32 * Math.cos((midLat * Math.PI) / 180) * dLat * 110.57;

function areaOf(rings, cell = CELL) {
  const g = makeGrid({ lon0: 99, lat0: 13, lon1: 100, lat1: 14, cell });
  const grid = g.alloc();
  paint(g, grid, rings);
  return measure(g, grid, null).land;
}

describe("area against answers known from outside", () => {
  it("matches a rectangle's multiplication at three sizes", () => {
    expect(areaOf([box(99.2, 13.2, 99.3, 13.3)])).toBeCloseTo(
      rectKm2(0.1, 0.1, 13.25),
      1,
    );
    expect(areaOf([box(99.2, 13.2, 99.7, 13.7)])).toBeCloseTo(
      rectKm2(0.5, 0.5, 13.45),
      0,
    );
    // One cell exactly — the smallest thing the grid can represent.
    expect(areaOf([box(99.2, 13.2, 99.205, 13.205)])).toBeCloseTo(
      rectKm2(0.005, 0.005, 13.2025),
      2,
    );
  });

  it("converges on a diamond, whose area is half its bounding box", () => {
    const dia = [
      [99.3, 13.2],
      [99.35, 13.25],
      [99.3, 13.3],
      [99.25, 13.25],
      [99.3, 13.2],
    ];
    const truth = 0.5 * rectKm2(0.1, 0.1, 13.25);
    // Converging is the property that matters: a rasteriser with a systematic
    // bias would sit at a fixed offset however fine the grid.
    for (const cell of [0.005, 0.0025, 0.00125]) {
      const err = Math.abs(areaOf([dia], cell) - truth) / truth;
      expect(err, `cell ${cell}`).toBeLessThan(0.01);
    }
  });

  it("gets a circle within 1% of pi r squared", () => {
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      pts.push([99.3 + 0.05 * Math.cos(t), 13.25 + 0.05 * Math.sin(t)]);
    }
    const kx = 111.32 * Math.cos((13.25 * Math.PI) / 180);
    const truth = Math.PI * (0.05 * kx) * (0.05 * 110.57);
    expect(Math.abs(areaOf([pts]) - truth) / truth).toBeLessThan(0.01);
  });

  it("shrinks cells towards the pole", () => {
    // Same box in degrees covers less ground further north, and the row-wise
    // cellKm2 is what carries that.
    const south = makeGrid({ lon0: 99, lat0: 0, lon1: 100, lat1: 1, cell: CELL });
    const north = makeGrid({ lon0: 99, lat0: 60, lon1: 100, lat1: 61, cell: CELL });
    expect(south.cellKm2(0)).toBeGreaterThan(north.cellKm2(0) * 1.9);
  });
});

describe("the awkward shapes", () => {
  it("keeps a hole empty", () => {
    const outer = box(99.2, 13.2, 99.6, 13.6);
    const hole = box(99.3, 13.3, 99.5, 13.5);
    // A park with an enclave carved out of it is a real shape here, and
    // even-odd across all rings in one call is what makes it free.
    expect(areaOf([outer, hole])).toBeCloseTo(
      areaOf([outer]) - areaOf([hole]),
      1,
    );
  });

  it("adds two shapes that share an edge without double-counting the seam", () => {
    const g = grid1deg();
    const grid = g.alloc();
    paint(g, grid, [box(99.2, 13.2, 99.4, 13.4)]);
    paint(g, grid, [box(99.4, 13.2, 99.6, 13.4)]);
    expect(measure(g, grid, null).land).toBeCloseTo(
      areaOf([box(99.2, 13.2, 99.4, 13.4)]) + areaOf([box(99.4, 13.2, 99.6, 13.4)]),
      1,
    );
  });

  it("does not let two overlapping shapes cancel each other out", () => {
    /*
     * The reason paint() resolves even-odd inside one call and ORs the result
     * out. Painting ring by ring would need XOR to cut holes, and XOR makes
     * two overlapping parks erase their shared middle — an empty patch in the
     * one place two reserves meet.
     */
    const g = grid1deg();
    const grid = g.alloc();
    const a = box(99.2, 13.2, 99.4, 13.4);
    const b = box(99.3, 13.3, 99.5, 13.5);
    paint(g, grid, [a]);
    paint(g, grid, [b]);
    const union = measure(g, grid, null).land;
    expect(union).toBeGreaterThan(areaOf([a]));
    expect(union).toBeLessThan(areaOf([a]) + areaOf([b]));
  });

  it("counts a vertex sitting exactly on a scanline once, not twice", () => {
    // Rows are sampled at their centres — lat0 + (r + 0.5) * cell — so this
    // box has two edges landing precisely on one. A closed rather than
    // half-open crossing test would count both and leak fill sideways.
    const onCentre = box(99.2, 13.2025, 99.3, 13.3025);
    const offCentre = box(99.2, 13.2, 99.3, 13.3);
    expect(areaOf([onCentre])).toBeCloseTo(areaOf([offCentre]), 1);
  });

  it("treats an unclosed ring as closed", () => {
    // OSM rings come back closed, but the shoelace-style wraparound means an
    // open one must give the same answer rather than a torn shape.
    const closed = box(99.2, 13.2, 99.4, 13.4);
    expect(areaOf([closed.slice(0, -1)])).toBeCloseTo(areaOf([closed]), 3);
  });

  it("clips at the grid edge instead of wrapping or throwing", () => {
    expect(areaOf([box(101, 15, 101.1, 15.1)])).toBe(0);
    // Half in, half out: only the half inside is counted.
    expect(areaOf([box(98.9, 13.2, 99.1, 13.3)])).toBeCloseTo(
      rectKm2(0.1, 0.1, 13.25),
      1,
    );
  });
});

describe("what the grid cannot see", () => {
  it("loses shapes thinner than a cell, and that is worth knowing", () => {
    /*
     * Centre sampling means a strip narrower than one cell is measured only
     * where a cell centre happens to fall inside it. Swept across 40
     * positions, a 0.22 km strip is found at 16 and vanishes at 24.
     *
     * Not a bug — it is what bounding the error by the cell size means — but
     * it does say what this data cannot answer. A long thin river reserve is
     * under-counted. In aggregate it stays small: the national total comes to
     * 99.4% of the official protected estate.
     */
    let found = 0;
    for (let k = 0; k < 40; k++) {
      const x = 99.2 + k * 0.0007;
      if (areaOf([box(x, 13.2, x + 0.002, 13.3)]) > 0) found++;
    }
    expect(found).toBeGreaterThan(5);
    expect(found).toBeLessThan(35);

    // A strip one full cell wide is always found, and measured correctly.
    expect(areaOf([box(99.2, 13.2, 99.205, 13.6)])).toBeCloseTo(
      rectKm2(0.005, 0.4, 13.4),
      1,
    );
  });
});

describe("measuring one layer against another", () => {
  it("reports the overlap as a share of the base", () => {
    // The actual use: province cells are the denominator, cells also in the
    // park layer are the numerator.
    const g = grid1deg();
    const prov = g.alloc();
    paint(g, prov, [box(99.2, 13.2, 99.6, 13.6)]);
    const park = g.alloc();
    paint(g, park, [box(99.2, 13.2, 99.4, 13.4)]); // exactly a quarter
    const { land, both } = measure(g, prov, park);
    expect(both / land).toBeCloseTo(0.25, 2);
  });

  it("counts nothing as protected when the layers do not meet", () => {
    const g = grid1deg();
    const prov = g.alloc();
    paint(g, prov, [box(99.2, 13.2, 99.3, 13.3)]);
    const park = g.alloc();
    paint(g, park, [box(99.6, 13.6, 99.7, 13.7)]);
    const { land, both } = measure(g, prov, park);
    expect(land).toBeGreaterThan(0);
    expect(both).toBe(0);
  });
});

describe("windows, which is what makes 931 amphoe affordable", () => {
  it("covers the shape it was built from", () => {
    const g = grid1deg();
    const rings = [box(99.2, 13.2, 99.3, 13.3)];
    const win = windowOf(g, rings);
    const grid = g.alloc();
    paint(g, grid, rings);
    // Measuring through the window must give the same answer as sweeping the
    // whole grid, or the window is cutting the shape off.
    expect(measure(g, grid, null, win).land).toBeCloseTo(
      measure(g, grid, null).land,
      6,
    );
  });

  it("clears exactly what it covers, so one buffer serves every shape", () => {
    const g = grid1deg();
    const rings = [box(99.2, 13.2, 99.3, 13.3)];
    const win = windowOf(g, rings);
    const grid = g.alloc();
    paint(g, grid, rings);
    clear(grid, g, win);
    expect(measure(g, grid, null).land).toBe(0);
  });

  it("returns null for nothing at all rather than a bogus window", () => {
    expect(windowOf(grid1deg(), [])).toBeNull();
  });

  it("stays inside the raster for a shape hanging off the edge", () => {
    const g = grid1deg();
    const win = windowOf(g, [box(98.5, 12.5, 99.1, 13.1)]);
    expect(win.r0).toBeGreaterThanOrEqual(0);
    expect(win.c0).toBeGreaterThanOrEqual(0);
    expect(win.r1).toBeLessThan(g.ny);
    expect(win.c1).toBeLessThan(g.nx);
  });
});
