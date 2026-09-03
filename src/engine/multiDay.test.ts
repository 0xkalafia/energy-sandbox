import { describe, it, expect } from "vitest";
import { simulateMultiDay, WEATHER_SCENARIOS } from "./multiDay";
import { optimizeResilientMix, DEFAULT_OPT } from "./optimize";
import { annualGrid, netDurationCurve, loadDurationCurve, MONTH_LABELS } from "./annual";
import { DEFAULT_INPUTS, MONTH_SEASON } from "@/data/constants";
import type { SimInputs } from "@/data/types";

const inp = (over: Partial<SimInputs> = {}): SimInputs => ({
  ...DEFAULT_INPUTS,
  ...over,
});

/**
 * Chaining days together is what makes the resilience story mean anything: a
 * battery that silently refills at midnight can survive any monsoon, and the
 * chart would look identical. So these check that state really carries.
 */
describe("simulateMultiDay — state carries across midnight", () => {
  it("starts each day exactly where the last one ended", () => {
    const r = simulateMultiDay(inp(), 5, "current", { gridLimitMW: 0 });
    for (let d = 1; d < r.daily.length; d++) {
      const firstHourOfDay = r.hourly[d * 24];
      const endOfPrevious = r.daily[d - 1].endSoC;
      // The opening hour has already dispatched, so it can't be *above* where
      // the previous day ended by more than one hour of charging.
      expect(Math.abs(firstHourOfDay.batterySoC - endOfPrevious)).toBeLessThan(0.3);
      expect(r.daily[d - 1].endSoC).toBeGreaterThanOrEqual(0);
    }
  });

  it("honours the requested starting charge", () => {
    const low = simulateMultiDay(inp(), 2, "current", { startSoC: 0.15 });
    const high = simulateMultiDay(inp(), 2, "current", { startSoC: 0.95 });
    expect(low.hourly[0].batterySoC).toBeLessThan(high.hourly[0].batterySoC);
  });

  it("clamps a hostile starting charge instead of running with it", () => {
    for (const startSoC of [-5, 42]) {
      const r = simulateMultiDay(inp(), 2, "current", { startSoC });
      expect(r.hourly.every((h) => h.batterySoC >= 0 && h.batterySoC <= 1)).toBe(true);
    }
  });

  it("emits days × 24 hours, numbered continuously", () => {
    const r = simulateMultiDay(inp(), 6, "current");
    expect(r.hourly).toHaveLength(6 * 24);
    expect(r.daily).toHaveLength(6);
    expect(r.hourly[0].globalHour).toBe(0);
    expect(r.hourly.at(-1)!.globalHour).toBe(6 * 24 - 1);
    expect(r.hourly[25].day).toBe(1);
    expect(r.hourly[25].hour).toBe(1);
  });

  it("reports the lowest charge seen anywhere, not just on the last day", () => {
    const r = simulateMultiDay(inp(), 7, "monsoonStreak", { gridLimitMW: 0 });
    const trueMin = Math.min(...r.hourly.map((h) => h.batterySoC));
    expect(r.lowestSoC).toBeCloseTo(trueMin, 9);
    expect(r.lowestSoC).toBeLessThanOrEqual(Math.min(...r.daily.map((d) => d.minSoC)) + 1e-9);
  });

  it("counts shortfall hours and energy consistently", () => {
    const starved = inp({ solarMW: 200, windMW: 50, biomassMW: 0, batteryGWh: 0 });
    const r = simulateMultiDay(starved, 4, "current", { gridLimitMW: 0 });
    const hoursWithUnmet = r.hourly.filter((h) => h.unmet > 1e-6).length;
    const energy = r.hourly.reduce((a, h) => a + h.unmet, 0) / 1000;
    expect(r.unmetHours).toBe(hoursWithUnmet);
    expect(r.unmetGWh).toBeCloseTo(energy, 6);
    expect(r.unmetHours).toBeGreaterThan(0);
  });

  it("keeps blackout and curtailment as separate counts", () => {
    // A curtailed mission is not a blackout; conflating them would make the
    // plan look far more fragile than it is.
    const r = simulateMultiDay(inp(), 5, "monsoonStreak", { gridLimitMW: 0 });
    expect(r.curtailedHours).toBeGreaterThan(0);
    expect(r.unmetHours).toBe(0);
    expect(r.curtailedGWh).toBeGreaterThan(0);
    expect(r.unmetGWh).toBe(0);
  });

  it("totals imports across every day", () => {
    const r = simulateMultiDay(inp({ season: "monsoon" }), 3, "current");
    expect(r.importTotalGWh).toBeCloseTo(
      r.daily.reduce((a, d) => a + d.importGWh, 0),
      6,
    );
    expect(r.importTotalGWh).toBeCloseTo(
      r.hourly.reduce((a, h) => a + h.gridImport, 0) / 1000,
      6,
    );
  });
});

describe("weather scenarios drive different days", () => {
  it("puts monsoon on days 2 to 6 and the chosen season either side", () => {
    const r = simulateMultiDay(inp({ season: "summer" }), 9, "monsoonStreak");
    const seasons = r.daily.map((d) => d.season);
    expect(seasons).toEqual([
      "summer", "summer",
      "monsoon", "monsoon", "monsoon", "monsoon", "monsoon",
      "summer", "summer",
    ]);
  });

  it("makes El Niño hot all week regardless of the sidebar", () => {
    const r = simulateMultiDay(inp({ season: "monsoon" }), 5, "elNino");
    expect(r.daily.every((d) => d.season === "summer")).toBe(true);
  });

  it("cycles the four seasons for a mixed week", () => {
    const r = simulateMultiDay(inp(), 6, "mixedWeek");
    expect(r.daily.map((d) => d.season)).toEqual([
      "summer", "rainy", "winter", "monsoon", "summer", "rainy",
    ]);
  });

  it("repeats the sidebar season for the default scenario", () => {
    const r = simulateMultiDay(inp({ season: "winter" }), 4, "current");
    expect(r.daily.every((d) => d.season === "winter")).toBe(true);
  });

  it("leaves the monsoon streak harder on the battery than the current season", () => {
    const now = simulateMultiDay(inp({ season: "summer" }), 8, "current", {
      gridLimitMW: 0,
    });
    const streak = simulateMultiDay(inp({ season: "summer" }), 8, "monsoonStreak", {
      gridLimitMW: 0,
    });
    expect(streak.lowestSoC).toBeLessThanOrEqual(now.lowestSoC);
  });

  it("lists every scenario the engine implements", () => {
    const ids = WEATHER_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const r = simulateMultiDay(inp(), 3, id);
      expect(r.scenario).toBe(id);
      expect(r.daily).toHaveLength(3);
    }
  });
});

/**
 * The optimiser answers "what's the cheapest mix that survives?", and the
 * answer is read straight off `best`. A comparison the wrong way round returns
 * the most expensive feasible point and nothing about the chart would say so.
 */
describe("optimizeResilientMix", () => {
  // A coarse grid keeps the test quick without changing what's being checked.
  const opts = { ...DEFAULT_OPT, days: 3, solarSteps: 4, batterySteps: 4 };

  it("sweeps the grid it says it swept", () => {
    const r = optimizeResilientMix(inp(), opts);
    expect(r.solarValues).toHaveLength(4);
    expect(r.batteryValues).toHaveLength(4);
    expect(r.grid).toHaveLength(16);
    expect(r.solarValues[0]).toBe(1000); // the range floor
    expect(r.solarValues.at(-1)).toBe(opts.solarMaxMW);
    expect(r.batteryValues[0]).toBe(2);
    expect(r.batteryValues.at(-1)).toBe(opts.batteryMaxGWh);
  });

  it("returns the cheapest feasible point, not merely a feasible one", () => {
    const r = optimizeResilientMix(inp(), opts);
    const feasible = r.grid.filter((p) => p.feasible);
    expect(feasible.length).toBeGreaterThan(0);
    expect(r.best).not.toBeNull();
    expect(r.best!.feasible).toBe(true);
    expect(r.best!.capex).toBe(Math.min(...feasible.map((p) => p.capex)));
  });

  it("marks a point feasible only when it never blacks out", () => {
    const r = optimizeResilientMix(inp(), opts);
    for (const p of r.grid) {
      expect(p.feasible).toBe(p.unmetHours === 0);
      expect(p.lowestSoC).toBeGreaterThanOrEqual(0);
      expect(p.lowestSoC).toBeLessThanOrEqual(1);
    }
  });

  it("finds nothing when even the largest mix can't hold", () => {
    // Lifestyle load far beyond anything the grid of options can serve
    // islanded: the honest answer is "no feasible point", not the nearest one.
    const r = optimizeResilientMix(inp({ lifestyleGWhPerDay: 400 }), opts);
    expect(r.grid.every((p) => !p.feasible)).toBe(true);
    expect(r.best).toBeNull();
  });

  it("reports the user's current mix alongside the search", () => {
    const i = inp({ solarMW: 7777, batteryGWh: 13 });
    const r = optimizeResilientMix(i, opts);
    expect(r.baseline.solarMW).toBe(7777);
    expect(r.baseline.batteryGWh).toBe(13);
    expect(r.baseline.capex).toBeGreaterThan(0);
    expect(typeof r.baseline.feasible).toBe("boolean");
  });

  it("prices each grid point on its own mix, not the user's", () => {
    const r = optimizeResilientMix(inp(), opts);
    const cheapest = r.grid.reduce((a, b) => (a.capex < b.capex ? a : b));
    const dearest = r.grid.reduce((a, b) => (a.capex > b.capex ? a : b));
    expect(cheapest.capex).toBeLessThan(dearest.capex);
    expect(cheapest.solarMW + cheapest.batteryGWh).toBeLessThan(
      dearest.solarMW + dearest.batteryGWh,
    );
  });
});

describe("annualGrid", () => {
  it("covers twelve months of twenty-four hours", () => {
    const cells = annualGrid(inp());
    expect(cells).toHaveLength(288);
    expect(cells[0]).toMatchObject({ month: 0, hour: 0 });
    expect(cells.at(-1)).toMatchObject({ month: 11, hour: 23 });
    expect(MONTH_LABELS).toHaveLength(12);
  });

  it("drives each month by its own season", () => {
    // March and December are different seasons, so their solar can't match.
    const cells = annualGrid(inp());
    const noonOf = (m: number) => cells[m * 24 + 12].supply;
    const march = MONTH_SEASON[2];
    const december = MONTH_SEASON[11];
    expect(march).not.toBe(december);
    expect(noonOf(2)).not.toBeCloseTo(noonOf(11), 3);
  });

  it("reports net as supply minus demand", () => {
    for (const c of annualGrid(inp())) {
      expect(c.net).toBeCloseTo(c.supply - c.demand, 6);
    }
  });
});

describe("duration curves", () => {
  const cells = annualGrid(inp());

  it("sorts net descending without losing an hour", () => {
    const curve = netDurationCurve(cells);
    expect(curve).toHaveLength(cells.length);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i - 1]).toBeGreaterThanOrEqual(curve[i]);
    }
    expect(curve[0]).toBeCloseTo(Math.max(...cells.map((c) => c.net)), 9);
    expect(curve.at(-1)).toBeCloseTo(Math.min(...cells.map((c) => c.net)), 9);
  });

  it("sorts demand descending, which is a different curve", () => {
    const load = loadDurationCurve(cells);
    for (let i = 1; i < load.length; i++) {
      expect(load[i - 1]).toBeGreaterThanOrEqual(load[i]);
    }
    expect(load[0]).toBeCloseTo(Math.max(...cells.map((c) => c.demand)), 9);
    expect(load).not.toEqual(netDurationCurve(cells));
  });

  it("sorts numerically, not as strings", () => {
    // The default Array#sort would put 1000 before 9 — a bug that looks
    // perfectly plausible on a smooth-ish curve.
    const curve = netDurationCurve(cells);
    const manual = [...cells.map((c) => c.net)].sort((a, b) => b - a);
    expect(curve).toEqual(manual);
  });
});
