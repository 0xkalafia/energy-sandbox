import { describe, it, expect } from "vitest";
import { DISTRICT_GEO, GEO_VIEWBOX, PARK_PATH, RESERVOIR_PATH } from "./districtGeo";
import { DISTRICTS, allocate, districtKm2 } from "./districts";
import { DEFAULT_INPUTS } from "./constants";

/**
 * districtGeo.ts is generated, so these don't test the geometry so much as the
 * contract the app relies on: that every district has a shape, that the shapes
 * are closed and inside the viewBox, and that the areas are real enough to
 * divide by. A regenerate that quietly dropped a district or shifted the
 * projection would leave a map with a hole in it and a density figure of zero,
 * neither of which throws.
 */

/** "M x,y L x,y … Z" repeated → rings of points. */
function parseRings(d: string): [number, number][][] {
  return d
    .split("M")
    .filter(Boolean)
    .map((sub) =>
      sub
        .replace(/Z$/, "")
        .split("L")
        .map((p) => p.split(",").map(Number) as [number, number]),
    );
}

function pointInRing(pt: [number, number], ring: [number, number][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi
    ) {
      hit = !hit;
    }
  }
  return hit;
}

describe("every district has geometry", () => {
  it("covers all eight, with no extras", () => {
    expect(DISTRICT_GEO).toHaveLength(8);
    expect(new Set(DISTRICT_GEO.map((g) => g.id)).size).toBe(8);
  });

  it("matches the ids used by the allocation model", () => {
    // The two lists are written in different places — this file from OSM's
    // English names, districts.ts by hand — so they can drift apart.
    expect(new Set(DISTRICT_GEO.map((g) => g.id))).toEqual(
      new Set(DISTRICTS.map((d) => d.id)),
    );
  });

  it("gives every district a non-trivial area", () => {
    for (const g of DISTRICT_GEO) {
      expect(g.km2, g.id).toBeGreaterThan(100);
      expect(g.km2, g.id).toBeLessThan(4000);
    }
  });

  it("sums to the province area, within a percent or so of the official figure", () => {
    // The end-to-end check on the pipeline: ring assembly, projection and the
    // shoelace all have to be right for this to land near 6,225 km².
    const total = DISTRICT_GEO.reduce((s, g) => s + g.km2, 0);
    expect(total).toBeGreaterThan(6100);
    expect(total).toBeLessThan(6300);
  });

  it("keeps Kaeng Krachan as by far the largest", () => {
    // The fact that motivated drawing real boundaries at all: two districts
    // are most of the province, and eight equal circles hid it.
    const byArea = [...DISTRICT_GEO].sort((a, b) => b.km2 - a.km2);
    expect(byArea[0].id).toBe("kaengkrachan");
    expect(byArea[1].id).toBe("nongyaplong");
    const total = DISTRICT_GEO.reduce((s, g) => s + g.km2, 0);
    expect((byArea[0].km2 + byArea[1].km2) / total).toBeGreaterThan(0.55);
  });
});

describe("the paths are drawable", () => {
  it.each(DISTRICT_GEO.map((g) => [g.id, g] as const))("%s closes its rings", (_id, g) => {
    const rings = parseRings(g.path);
    expect(rings.length).toBeGreaterThan(0);
    for (const r of rings) {
      expect(r.length).toBeGreaterThan(3);
      expect(r[0]).toEqual(r.at(-1));
      expect(r.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    }
  });

  it("stays inside the viewBox", () => {
    for (const g of DISTRICT_GEO) {
      for (const [x, y] of parseRings(g.path).flat()) {
        expect(x, g.id).toBeGreaterThanOrEqual(0);
        expect(y, g.id).toBeGreaterThanOrEqual(0);
        expect(x, g.id).toBeLessThanOrEqual(GEO_VIEWBOX.width);
        expect(y, g.id).toBeLessThanOrEqual(GEO_VIEWBOX.height);
      }
    }
  });

  it("puts every label inside its own district", () => {
    // An area-weighted centroid escapes a concave shape easily, and a label
    // floating over a neighbour reads as a mistake in the data.
    for (const g of DISTRICT_GEO) {
      const inside = parseRings(g.path).some((r) => pointInRing(g.centroid, r));
      expect(inside, `${g.id} label falls outside its shape`).toBe(true);
    }
  });

  it("keeps shared borders aligned after simplification", () => {
    // Simplifying each district on its own is the classic way to open slivers
    // along a shared border. It survives here because neighbours reference the
    // same OSM ways, so identical input simplifies identically — but that's a
    // property worth pinning rather than trusting.
    const all = DISTRICT_GEO.map((g) => ({ id: g.id, pts: parseRings(g.path).flat() }));
    let exact = 0;
    let total = 0;
    for (const a of all) {
      for (const p of a.pts) {
        total++;
        const shared = all.some(
          (b) => b.id !== a.id && b.pts.some((q) => q[0] === p[0] && q[1] === p[1]),
        );
        if (shared) exact++;
      }
    }
    // The rest is the province outline and the coast, which have no neighbour.
    expect(exact / total).toBeGreaterThan(0.5);
  });

  it("has a reservoir and a park to draw", () => {
    expect(RESERVOIR_PATH.length).toBeGreaterThan(200);
    expect(PARK_PATH.length).toBeGreaterThan(200);
    expect(RESERVOIR_PATH.startsWith("M")).toBe(true);
    expect(PARK_PATH.startsWith("M")).toBe(true);
  });
});

describe("density is derived from the real area", () => {
  it("divides capacity by the district's own km²", () => {
    for (const a of allocate(DEFAULT_INPUTS)) {
      expect(a.km2).toBe(districtKm2(a.d.id));
      expect(a.capacityMWPerKm2).toBeCloseTo(a.capacityMW / a.km2, 9);
    }
  });

  it("ranks differently from the raw total, which is the point of the toggle", () => {
    // Kaeng Krachan collects a lot by being 42% of the province while being
    // among the least dense. If the two orderings ever agreed, the toggle
    // would be decoration.
    const a = allocate(DEFAULT_INPUTS);
    const byTotal = [...a].sort((x, y) => y.capacityMW - x.capacityMW).map((x) => x.d.id);
    const byDensity = [...a]
      .sort((x, y) => y.capacityMWPerKm2 - x.capacityMWPerKm2)
      .map((x) => x.d.id);
    expect(byDensity).not.toEqual(byTotal);
    expect(byDensity.indexOf("kaengkrachan")).toBeGreaterThan(
      byTotal.indexOf("kaengkrachan"),
    );
  });

  it("spreads density far wider than totals, so the shading has something to show", () => {
    const a = allocate(DEFAULT_INPUTS);
    const spread = (xs: number[]) => Math.max(...xs) / Math.min(...xs);
    expect(spread(a.map((x) => x.capacityMWPerKm2))).toBeGreaterThan(
      spread(a.map((x) => x.capacityMW)) * 2,
    );
  });

  it("never divides by zero, whatever the sliders say", () => {
    const a = allocate({ ...DEFAULT_INPUTS, solarMW: 0, windMW: 0, hydroMW: 0 });
    for (const x of a) {
      expect(Number.isFinite(x.capacityMWPerKm2)).toBe(true);
      expect(x.capacityMWPerKm2).toBe(0);
    }
  });
});
