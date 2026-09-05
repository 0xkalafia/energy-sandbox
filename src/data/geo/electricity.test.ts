import { describe, it, expect } from "vitest";
import { PROVINCE_ELECTRICITY } from "./electricity";
import { PROVINCES } from "./provinces";

/**
 * electricity.ts is parsed out of six .xlsx files by a spreadsheet reader
 * written for this repo, which is exactly the arrangement that produces
 * confident nonsense: a column shifts by one between years and every number
 * is still a number.
 *
 * The reader was checked against openpyxl on the same file and agreed to the
 * decimal, but that was one check on one day. These tests are the standing
 * version: they hold the data against things known from outside it — the
 * national total, which province is largest, and the shape of the pandemic.
 */

const byIso = new Map(PROVINCE_ELECTRICITY.map((r) => [r.iso, r]));
const nameOf = new Map(PROVINCES.map((p) => [p.iso, p.en]));

describe("every province, measured", () => {
  it("covers all 77 with no province invented or lost", () => {
    expect(PROVINCE_ELECTRICITY).toHaveLength(77);
    expect(new Set(PROVINCE_ELECTRICITY.map((r) => r.iso))).toEqual(
      new Set(PROVINCES.map((p) => p.iso)),
    );
  });

  it("sums to Thailand's actual consumption", () => {
    const twh = PROVINCE_ELECTRICITY.reduce((s, r) => s + r.gwhPerYear, 0) / 1000;
    // Thailand used a little over 200 TWh in 2023. Parsing into the wrong
    // columns, or dropping a tariff class, lands nowhere near this.
    expect(twh).toBeGreaterThan(180);
    expect(twh).toBeLessThan(220);
  });

  it("keeps the class breakdown consistent with the total", () => {
    for (const r of PROVINCE_ELECTRICITY) {
      const sum = Object.values(r.byClass).reduce((s, v) => s + v, 0);
      expect(Math.abs(sum - r.gwhPerYear), r.iso).toBeLessThan(1);
      expect(Math.abs(r.gwhPerDay * 365 - r.gwhPerYear), r.iso).toBeLessThan(1);
    }
  });

  it("has a six-year series ending at the headline year", () => {
    for (const r of PROVINCE_ELECTRICITY) {
      expect(r.series, r.iso).toHaveLength(6);
      expect(Math.abs(r.series.at(-1)! - r.gwhPerYear), r.iso).toBeLessThan(1);
      for (const v of r.series) expect(v, r.iso).toBeGreaterThan(0);
    }
  });
});

describe("the data agrees with things known from outside it", () => {
  it("puts Bangkok first and Mae Hong Son last", () => {
    const order = [...PROVINCE_ELECTRICITY].sort((a, b) => b.gwhPerYear - a.gwhPerYear);
    expect(nameOf.get(order[0].iso)).toBe("Bangkok");
    expect(nameOf.get(order.at(-1)!.iso)).toBe("Mae Hong Son");
    // Bangkok is a large share of the country but not most of it.
    const share = order[0].gwhPerYear / PROVINCE_ELECTRICITY.reduce((s, r) => s + r.gwhPerYear, 0);
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.3);
  });

  it("ranks the industrial east above bigger, poorer provinces", () => {
    // Rayong is petrochemicals and Chon Buri is the eastern seaboard; Buri Ram
    // and Si Sa Ket have more people and far less industry. A parse that
    // mangled columns would not preserve this.
    for (const industrial of ["TH-21", "TH-20"]) {
      for (const rural of ["TH-31", "TH-33"]) {
        expect(
          byIso.get(industrial)!.gwhPerYear,
          `${nameOf.get(industrial)} vs ${nameOf.get(rural)}`,
        ).toBeGreaterThan(byIso.get(rural)!.gwhPerYear * 3);
      }
    }
  });

  it("shows the 2020 dip that the pandemic actually caused", () => {
    // Series runs 2018-2023. National consumption fell in 2020 and recovered
    // after: an independent fact the file was not built to satisfy, so it is
    // a real check that the years are in the order they claim.
    const national = [0, 0, 0, 0, 0, 0];
    for (const r of PROVINCE_ELECTRICITY) r.series.forEach((v, i) => (national[i] += v));
    expect(national[2], "2020 below 2019").toBeLessThan(national[1]);
    expect(national[3], "2021 recovers").toBeGreaterThan(national[2]);
    expect(national[5], "2023 is the highest").toBe(Math.max(...national));
  });
});

describe("per-person consumption, which is what the model reasons about", () => {
  it("is plausible everywhere it can be computed", () => {
    const withPop = PROVINCE_ELECTRICITY.filter((r) => r.kwhPerPerson != null);
    expect(withPop.length).toBeGreaterThan(70);
    for (const r of withPop) {
      // The spread is genuinely enormous — Rayong's petrochemical plants
      // against Buri Ram's rice — so these bounds are only there to catch a
      // misplaced factor of a thousand.
      expect(r.kwhPerPerson!, nameOf.get(r.iso)).toBeGreaterThan(200);
      expect(r.kwhPerPerson!, nameOf.get(r.iso)).toBeLessThan(60_000);
    }
  });

  it("gives Phetchaburi a figure the simulator can be checked against", () => {
    const pb = byIso.get("TH-76")!;
    // The province the model is built for: 4.3 GWh/day across every tariff
    // class. DEFAULT_INPUTS puts lifestyle load alone at 7.5 GWh/day in 2046,
    // so the scenario assumes real growth rather than describing today.
    expect(pb.gwhPerDay).toBeGreaterThan(3.5);
    expect(pb.gwhPerDay).toBeLessThan(5.5);
  });
});
