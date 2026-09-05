import { describe, it, expect } from "vitest";
import { PROVINCE_PROTECTED } from "./protected";
import { PROVINCES } from "./provinces";

/**
 * protected.ts came within one OSM tag of being silently useless. Querying
 * boundary=protected_area alone returned 253 areas and 42,824 km² — 39% of
 * Thailand's protected estate — with Kaeng Krachan, the largest national park
 * in the country, missing entirely. Phetchaburi read 0% protected, which is
 * the exact opposite of the finding this data exists to support, and nothing
 * threw. Adding boundary=national_park brought it to 391 areas and 109,380
 * km², which is 99% of the official figure.
 *
 * So these tests are aimed at that class of failure: not "is the arithmetic
 * right" but "is the data still there at all".
 */

const byIso = new Map(PROVINCE_PROTECTED.map((r) => [r.iso, r]));
const areaOf = new Map(PROVINCES.map((p) => [p.iso, p.km2]));

describe("coverage of the national protected estate", () => {
  it("covers every province", () => {
    expect(PROVINCE_PROTECTED).toHaveLength(PROVINCES.length);
    expect(new Set(PROVINCE_PROTECTED.map((r) => r.iso))).toEqual(
      new Set(PROVINCES.map((p) => p.iso)),
    );
  });

  it("totals close to the 110,000 km² Thailand actually protects", () => {
    const total = PROVINCE_PROTECTED.reduce((s, r) => s + r.protectedKm2, 0);
    // Wide bounds on purpose: this is not measuring precision, it is catching
    // a refetch that lost a tag and came back with a third of the country's
    // parks. The bad run scored 42,824 and would fail here.
    expect(total).toBeGreaterThan(90_000);
    expect(total).toBeLessThan(130_000);
  });

  it("puts the big parks where they are", () => {
    // Kaeng Krachan sits in Phetchaburi and is the specific park whose absence
    // made the first attempt worthless. Kanchanaburi holds Thung Yai and Huai
    // Kha Khaeng. Bangkok has essentially nothing to protect.
    expect(byIso.get("TH-76")!.protectedFrac, "Phetchaburi").toBeGreaterThan(0.3);
    expect(byIso.get("TH-71")!.protectedFrac, "Kanchanaburi").toBeGreaterThan(0.3);
    expect(byIso.get("TH-58")!.protectedFrac, "Mae Hong Son").toBeGreaterThan(0.3);
    expect(byIso.get("TH-10")!.protectedFrac, "Bangkok").toBeLessThan(0.05);
  });
});

describe("the raster agrees with the polygons it was built from", () => {
  /**
   * The whole method is a scan-conversion onto a 550 m grid, so the fraction
   * is only as good as the grid's picture of the province. Comparing the
   * rasterised area against the area measured from the polygons is the check
   * that the two are looking at the same place.
   *
   * This caught a real fault: the build read the boundary cache without the
   * foreign-district filter, so Ranong's denominator included Kawthoung in
   * Myanmar and it rastered to 16,875 km² against a true 3,279 — a 414% error
   * that turned its protected share into a sixth of the truth.
   */
  it("lands within 5% for every province", () => {
    for (const r of PROVINCE_PROTECTED) {
      const poly = areaOf.get(r.iso)!;
      expect(Math.abs(r.rasterKm2 - poly) / poly, r.iso).toBeLessThan(0.05);
    }
  });

  it("keeps every fraction inside its own province", () => {
    for (const r of PROVINCE_PROTECTED) {
      expect(r.protectedFrac, r.iso).toBeGreaterThanOrEqual(0);
      expect(r.protectedFrac, r.iso).toBeLessThanOrEqual(1);
      expect(r.protectedKm2, r.iso).toBeLessThanOrEqual(r.rasterKm2 + 1);
    }
  });
});
