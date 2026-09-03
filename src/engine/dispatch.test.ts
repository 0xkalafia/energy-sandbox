import { describe, it, expect } from "vitest";
import { shapeShiftable, simulateDay } from "./simulate";
import {
  DEFAULT_INPUTS,
  CF_BY_SEASON,
  DEMAND_SEASON,
  SMART_DISPATCH_MAX_BOOST,
} from "@/data/constants";
import type { SimInputs } from "@/data/types";

const inp = (over: Partial<SimInputs> = {}): SimInputs => ({
  ...DEFAULT_INPUTS,
  ...over,
});
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/**
 * `shapeShiftable` decides *when* a curtailable plant runs. It is the whole of
 * smart dispatch, and the one promise it must never break is that moving load
 * around doesn't create or destroy any: a bug here would quietly hand the plan
 * free energy, and every downstream number would still look sensible.
 */
describe("shapeShiftable — moving load, not inventing it", () => {
  const flatHeadroom = Array(24).fill(1000);
  /** Surplus concentrated in the middle of the day, as solar makes it. */
  const solarHeadroom = Array.from({ length: 24 }, (_, h) =>
    h >= 8 && h <= 16 ? 2000 : 0,
  );

  it("conserves the daily energy exactly", () => {
    for (const headroom of [flatHeadroom, solarHeadroom, Array(24).fill(0)]) {
      const alloc = shapeShiftable(24_000, headroom, 0.25, 1.6);
      expect(sum(alloc)).toBeCloseTo(24_000, 6);
    }
  });

  it("always returns 24 hours", () => {
    expect(shapeShiftable(1000, flatHeadroom, 0.3, 1.5)).toHaveLength(24);
    expect(shapeShiftable(0, flatHeadroom, 0.3, 1.5)).toHaveLength(24);
  });

  it("returns a day of zeros for nothing to place", () => {
    expect(shapeShiftable(0, flatHeadroom, 0.25, 1.6).every((v) => v === 0)).toBe(true);
    expect(shapeShiftable(-5, flatHeadroom, 0.25, 1.6).every((v) => v === 0)).toBe(true);
  });

  it("keeps every hour at or above the turndown floor", () => {
    // A chemical plant can't cold-stop overnight; the floor is what stops the
    // allocator emptying the small hours entirely.
    const alloc = shapeShiftable(24_000, solarHeadroom, 0.4, 1.6);
    const avg = 24_000 / 24;
    for (const v of alloc) expect(v).toBeGreaterThanOrEqual(avg * 0.4 - 1e-6);
  });

  it("keeps every hour at or below the boost ceiling", () => {
    // The ceiling is what makes shifting cost something: run 1.6× at noon and
    // you have to buy 1.6× the nameplate.
    const alloc = shapeShiftable(24_000, solarHeadroom, 0.25, 1.6);
    const avg = 24_000 / 24;
    for (const v of alloc) expect(v).toBeLessThanOrEqual(avg * 1.6 + 1e-6);
  });

  it("actually favours the sunny hours", () => {
    const alloc = shapeShiftable(24_000, solarHeadroom, 0.25, 1.6);
    const midday = sum(alloc.slice(8, 17));
    const night = sum(alloc) - midday;
    expect(midday).toBeGreaterThan(night);
    expect(alloc[12]).toBeGreaterThan(alloc[3]);
  });

  it("ranks by headroom rather than by hour", () => {
    // One generous hour late in the day: if the sort were dropped, the first
    // hours would fill instead.
    const headroom = Array(24).fill(0);
    headroom[20] = 5000;
    const alloc = shapeShiftable(24_000, headroom, 0.25, 1.6);
    expect(alloc[20]).toBe(Math.max(...alloc));
    expect(alloc[20]).toBeGreaterThan(alloc[0]);
  });

  it("collapses to flat when there is no surplus anywhere — a monsoon day", () => {
    const alloc = shapeShiftable(24_000, Array(24).fill(0), 0.25, 1.6);
    const avg = 24_000 / 24;
    for (const v of alloc) expect(v).toBeCloseTo(avg, 6);
  });

  it("collapses to flat when the ceiling leaves no room to move", () => {
    const alloc = shapeShiftable(24_000, solarHeadroom, 1, 1);
    const avg = 24_000 / 24;
    for (const v of alloc) expect(v).toBeCloseTo(avg, 6);
  });

  it("won't chase surplus that isn't there while there's real surplus left", () => {
    // Pass 1 is bounded by headroom as well as by the plant ceiling. With
    // plenty of surplus to go round, no hour is pushed past what its own hour
    // can actually supply.
    const headroom = Array(24).fill(3000);
    headroom[10] = 900; // one lean hour among generous ones
    const alloc = shapeShiftable(24_000, headroom, 0, 1.6);
    expect(alloc[10]).toBeLessThanOrEqual(900 + 1e-6);
    expect(sum(alloc)).toBeCloseTo(24_000, 6);
  });

  it("places the remainder anyway once the surplus runs out", () => {
    // Pass 2 deliberately ignores headroom: the plant has a day's work to do
    // and the energy has to go somewhere. It fills to the ceiling instead,
    // which is what makes a monsoon day degrade back toward flat rather than
    // silently losing production.
    const headroom = Array(24).fill(0);
    headroom[10] = 900;
    const avg = 24_000 / 24;
    const alloc = shapeShiftable(24_000, headroom, 0, 1.6);
    expect(alloc[10]).toBeGreaterThan(900); // pushed past its own headroom
    expect(alloc[10]).toBeLessThanOrEqual(avg * 1.6 + 1e-6); // but not past the plant
    expect(sum(alloc)).toBeCloseTo(24_000, 6);
  });

  it("clamps a turndown outside 0..1 instead of distorting the day", () => {
    const avg = 24_000 / 24;
    const over = shapeShiftable(24_000, solarHeadroom, 5, 1.6);
    // minTurndown 5 clamps to 1 → floor equals average → nothing can move.
    for (const v of over) expect(v).toBeCloseTo(avg, 6);

    const under = shapeShiftable(24_000, solarHeadroom, -2, 1.6);
    expect(sum(under)).toBeCloseTo(24_000, 6);
    for (const v of under) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("treats a boost below 1 as no boost at all", () => {
    const avg = 24_000 / 24;
    const alloc = shapeShiftable(24_000, solarHeadroom, 0.25, 0.5);
    // A ceiling under the average would make the day unplaceable; Math.max(1,…)
    // is what stops that.
    expect(sum(alloc)).toBeCloseTo(24_000, 6);
    for (const v of alloc) expect(v).toBeCloseTo(avg, 6);
  });

  it("never allocates a negative hour", () => {
    for (const headroom of [flatHeadroom, solarHeadroom, Array(24).fill(-100)]) {
      const alloc = shapeShiftable(12_345, headroom, 0.3, 1.6);
      expect(alloc.every((v) => v >= 0)).toBe(true);
      expect(sum(alloc)).toBeCloseTo(12_345, 6);
    }
  });
});

/**
 * The hourly loop itself: how much each source contributes, and the merit order
 * that decides who goes short when there isn't enough.
 */
describe("supply shaping", () => {
  it("gives each source its capacity factor for the season", () => {
    for (const season of ["summer", "rainy", "winter", "monsoon"] as const) {
      const i = inp({ season, solarMW: 1000, windMW: 1000, biomassMW: 100, hydroMW: 50 });
      const cf = CF_BY_SEASON[season];
      const hourly = simulateDay(i);
      const daily = (k: "solar" | "wind" | "biomass" | "hydro") =>
        hourly.reduce((a, h) => a + h[k], 0);
      expect(daily("solar")).toBeCloseTo(1000 * 24 * cf.solar, 6);
      expect(daily("wind")).toBeCloseTo(1000 * 24 * cf.wind, 6);
      expect(daily("biomass")).toBeCloseTo(100 * 24 * cf.biomass, 6);
      expect(daily("hydro")).toBeCloseTo(50 * 24 * cf.hydro, 6);
    }
  });

  it("runs biomass and hydro flat, and solar and wind on a shape", () => {
    const hourly = simulateDay(inp({ biomassMW: 100, hydroMW: 20, solarMW: 5000 }));
    const bio = hourly.map((h) => h.biomass);
    const hyd = hourly.map((h) => h.hydro);
    expect(new Set(bio.map((v) => v.toFixed(6))).size).toBe(1);
    expect(new Set(hyd.map((v) => v.toFixed(6))).size).toBe(1);
    // Solar is not flat, and is dark at both ends of the day.
    expect(hourly[12].solar).toBeGreaterThan(hourly[3].solar);
    expect(hourly[3].solar).toBe(0);
  });

  it("scales the lifestyle load by season and leaves the missions alone", () => {
    const daily = (season: SimInputs["season"], k: "lifestyle" | "dataCenter") =>
      simulateDay(inp({ season })).reduce((a, h) => a + h[k], 0);
    expect(daily("summer", "lifestyle") / daily("winter", "lifestyle")).toBeCloseTo(
      DEMAND_SEASON.summer / DEMAND_SEASON.winter,
      6,
    );
    expect(daily("summer", "dataCenter")).toBeCloseTo(
      daily("winter", "dataCenter"),
      6,
    );
  });
});

describe("merit order — who goes short first", () => {
  /** Barely any supply, no battery, no grid: something has to give. */
  const starved = inp({
    solarMW: 200,
    windMW: 50,
    biomassMW: 0,
    hydroMW: 0,
    batteryGWh: 0,
  });

  it("blacks out critical load only after every mission is curtailed", () => {
    const hourly = simulateDay(starved, { gridLimitMW: 0 });
    for (const h of hourly) {
      if (h.unmet > 1e-6) {
        const flexible =
          h.dac + h.methanol + h.dataCenter + h.desal + h.waste + h.wwt;
        expect(h.curtailed).toBeCloseTo(flexible, 6);
      }
    }
    expect(hourly.some((h) => h.unmet > 0)).toBe(true);
  });

  it("never blacks out critical load while the grid is unlimited", () => {
    const hourly = simulateDay(starved);
    expect(hourly.every((h) => h.unmet === 0)).toBe(true);
    expect(hourly.some((h) => h.gridImport > 0)).toBe(true);
  });

  it("caps imports at the grid limit", () => {
    const cap = 500;
    const hourly = simulateDay(starved, { gridLimitMW: cap });
    for (const h of hourly) expect(h.gridImport).toBeLessThanOrEqual(cap + 1e-9);
    expect(hourly.some((h) => h.gridImport > cap - 1e-6)).toBe(true);
  });

  it("shares one hour's supply out without double-spending it", () => {
    const hourly = simulateDay(DEFAULT_INPUTS);
    for (const h of hourly) {
      const served = h.totalDemand - h.unmet - h.curtailed;
      const sources = h.totalSupply + Math.max(0, -h.batteryFlow) + h.gridImport;
      expect(served).toBeLessThanOrEqual(sources + 1e-6);
    }
  });
});

describe("battery limits", () => {
  it("never discharges below the DoD floor", () => {
    const hourly = simulateDay(
      inp({ batteryGWh: 5, batteryDoDFloor: 0.2, solarMW: 500, windMW: 100 }),
      { gridLimitMW: 0, startSoC: 0.9 },
    );
    for (const h of hourly) expect(h.batterySoC).toBeGreaterThanOrEqual(0.2 - 1e-6);
  });

  it("never charges above full", () => {
    const hourly = simulateDay(inp({ batteryGWh: 2, solarMW: 20000 }), {
      startSoC: 0.95,
    });
    for (const h of hourly) expect(h.batterySoC).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("honours the 0.25C power rating in both directions", () => {
    const capMWh = 4 * 1000;
    const hourly = simulateDay(inp({ batteryGWh: 4, solarMW: 20000 }), {
      startSoC: 0.5,
    });
    for (const h of hourly) {
      expect(Math.abs(h.batteryFlow)).toBeLessThanOrEqual(capMWh * 0.25 + 1e-6);
    }
  });

  it("loses energy to round-trip efficiency rather than gaining it", () => {
    // Charge then discharge must come back with less than went in; a
    // square-root split applied the wrong way round would mint energy.
    const lossy = simulateDay(inp({ batteryGWh: 10, batteryRoundTrip: 0.5 }), {
      startSoC: 0.5,
    });
    const charged = lossy.reduce((a, h) => a + Math.max(0, h.batteryFlow), 0);
    const discharged = lossy.reduce((a, h) => a + Math.max(0, -h.batteryFlow), 0);
    const socDelta = (lossy[23].batterySoC - 0.5) * 10 * 1000;
    expect(charged - discharged).toBeGreaterThanOrEqual(socDelta - 1e-6);
  });

  it("starts where it is told to", () => {
    const low = simulateDay(inp({ batteryGWh: 20 }), { startSoC: 0.15 });
    const high = simulateDay(inp({ batteryGWh: 20 }), { startSoC: 0.95 });
    expect(low[0].batterySoC).toBeLessThan(high[0].batterySoC);
  });

  it("reports a flat zero state of charge when there is no battery", () => {
    const hourly = simulateDay(inp({ batteryGWh: 0 }));
    expect(hourly.every((h) => h.batterySoC === 0)).toBe(true);
    expect(hourly.every((h) => h.batteryFlow === 0)).toBe(true);
  });
});

describe("smart dispatch, end to end", () => {
  const on = inp({ smartDispatch: true });
  const off = inp({ smartDispatch: false });

  it("moves mission load into the day without changing the daily total", () => {
    const dailyOf = (i: SimInputs) => {
      const h = simulateDay(i);
      return {
        dac: h.reduce((a, x) => a + x.dac, 0),
        desal: h.reduce((a, x) => a + x.desal, 0),
        midday: h.slice(9, 16).reduce((a, x) => a + x.dac, 0),
      };
    };
    const a = dailyOf(off);
    const b = dailyOf(on);
    expect(b.dac).toBeCloseTo(a.dac, 3);
    expect(b.desal).toBeCloseTo(a.desal, 3);
    expect(b.midday).toBeGreaterThan(a.midday);
  });

  it("leaves the continuous processes alone", () => {
    const dc = (i: SimInputs) => simulateDay(i).map((h) => h.dataCenter);
    const wwt = (i: SimInputs) => simulateDay(i).map((h) => h.wwt);
    expect(dc(on)).toEqual(dc(off));
    expect(wwt(on)).toEqual(wwt(off));
  });

  it("respects the global boost ceiling on the shifted block", () => {
    const h = simulateDay(on);
    const block = h.map((x) => x.dac + x.methanol + x.desal + x.waste);
    const avg = sum(block) / 24;
    for (const v of block) {
      expect(v).toBeLessThanOrEqual(avg * SMART_DISPATCH_MAX_BOOST + 1e-6);
    }
  });

  it("changes nothing when every shiftable mission is off", () => {
    const none = {
      dacOn: false,
      methanolOn: false,
      desalOn: false,
      wasteOn: false,
    };
    const a = simulateDay(inp({ ...none, smartDispatch: false }));
    const b = simulateDay(inp({ ...none, smartDispatch: true }));
    expect(b.map((h) => h.totalDemand)).toEqual(a.map((h) => h.totalDemand));
  });
});
