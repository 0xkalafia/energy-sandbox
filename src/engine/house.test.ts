import { describe, it, expect } from "vitest";
import { simulateHouse, DEFAULT_HOUSE, type HouseInputs } from "./house";

/**
 * The residential model is the one a real person checks against their own
 * bill, so its arithmetic has to be defensible line by line — and it's already
 * been wrong once in a way that mattered: battery payback was charged against
 * the *combined* solar-plus-battery saving and came out roughly thirty times
 * too optimistic (0.2 years against a true 6.5).
 */

const h = (over: Partial<HouseInputs> = {}): HouseInputs => ({
  ...DEFAULT_HOUSE,
  ...over,
});
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("sizing", () => {
  it("produces nameplate × 24 × capacity factor", () => {
    const r = simulateHouse(h({ solarW: 5000, capacityFactor: 0.15 }));
    expect(r.solarKWhDay).toBeCloseTo(5 * 24 * 0.15, 9);
  });

  it("derives daily consumption from the bill, the tariff and occupancy", () => {
    const r = simulateHouse(
      h({ monthlyBill: 3000, tariff: 4, occupancy: 0.5, evOn: false }),
    );
    // ฿3000 / ฿4 per unit / 30 days = 25 kWh/day at full occupancy.
    expect(r.loadKWhDay).toBeCloseTo(25 * 0.5, 9);
  });

  it("adds EV charging on top of the household load", () => {
    const off = simulateHouse(h({ evOn: false }));
    const on = simulateHouse(h({ evOn: true, evKWhPerDay: 8 }));
    expect(on.loadKWhDay - off.loadKWhDay).toBeCloseTo(8, 9);
  });

  it("charges the car in the middle of the day, off the solar peak", () => {
    const on = simulateHouse(h({ evOn: true, evKWhPerDay: 12 }));
    const off = simulateHouse(h({ evOn: false }));
    const extra = on.hourly.map((x, i) => x.load - off.hourly[i].load);
    expect(sum(extra)).toBeCloseTo(12, 6);
    // Hours 10–15 inclusive carry all of it; nothing at 3am.
    expect(sum(extra.slice(10, 16))).toBeCloseTo(12, 6);
    expect(extra[3]).toBeCloseTo(0, 9);
  });
});

describe("hourly balance", () => {
  it("accounts for every kWh of solar and every kWh of load", () => {
    const r = simulateHouse(h({ solarW: 6000, batteryKWh: 10 }));
    for (const x of r.hourly) {
      expect(x.gridImport).toBeGreaterThanOrEqual(0);
      expect(x.gridExport).toBeGreaterThanOrEqual(0);
      // Never importing and exporting in the same hour.
      expect(Math.min(x.gridImport, x.gridExport)).toBeCloseTo(0, 9);
    }
    expect(sum(r.hourly.map((x) => x.gridImport))).toBeCloseTo(r.importKWhDay, 6);
    expect(sum(r.hourly.map((x) => x.gridExport))).toBeCloseTo(r.exportKWhDay, 6);
  });

  it("imports the whole load when there is no solar", () => {
    const r = simulateHouse(h({ solarW: 0, batteryKWh: 0 }));
    expect(r.importKWhDay).toBeCloseTo(r.loadKWhDay, 6);
    expect(r.exportKWhDay).toBeCloseTo(0, 9);
    expect(r.selfSufficiency).toBeCloseTo(0, 9);
  });

  it("exports the surplus when solar far outruns the house", () => {
    const r = simulateHouse(h({ solarW: 20000, batteryKWh: 0 }));
    expect(r.exportKWhDay).toBeGreaterThan(0);
    expect(r.importKWhDay).toBeGreaterThan(0); // still dark at night
  });
});

describe("battery limits", () => {
  it("never discharges below the 10% floor", () => {
    const r = simulateHouse(h({ batteryKWh: 10, solarW: 4000 }));
    for (const x of r.hourly) expect(x.soc).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it("never charges above full", () => {
    const r = simulateHouse(h({ batteryKWh: 5, solarW: 20000 }));
    for (const x of r.hourly) expect(x.soc).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("honours the 0.5C inverter limit", () => {
    // A 10 kWh pack moves at most 5 kW, so no hour can swing further.
    const cap = 10;
    const r = simulateHouse(h({ batteryKWh: cap, solarW: 20000 }));
    for (let i = 1; i < r.hourly.length; i++) {
      const delta = Math.abs(r.hourly[i].soc - r.hourly[i - 1].soc) * cap;
      expect(delta).toBeLessThanOrEqual(cap * 0.5 + 1e-6);
    }
  });

  it("reports a flat zero state of charge with no pack", () => {
    const r = simulateHouse(h({ batteryKWh: 0 }));
    expect(r.hourly.every((x) => x.soc === 0)).toBe(true);
  });

  it("cuts imports when a battery is added", () => {
    const none = simulateHouse(h({ batteryKWh: 0, solarW: 6000 }));
    const some = simulateHouse(h({ batteryKWh: 15, solarW: 6000 }));
    expect(some.importKWhDay).toBeLessThan(none.importKWhDay);
    expect(some.exportKWhDay).toBeLessThan(none.exportKWhDay);
    expect(some.selfSufficiency).toBeGreaterThan(none.selfSufficiency);
  });
});

describe("self-consumption and self-sufficiency are different questions", () => {
  it("counts stored solar as used onsite, not as spilled", () => {
    const r = simulateHouse(h({ solarW: 8000, batteryKWh: 20 }));
    expect(r.selfConsumption).toBeGreaterThan(0);
    expect(r.selfConsumption).toBeLessThanOrEqual(1);
  });

  it("stays inside 0..1 at both extremes", () => {
    for (const i of [
      h({ solarW: 0 }),
      h({ solarW: 50000, batteryKWh: 100 }),
      h({ occupancy: 0.2, solarW: 20000 }),
    ]) {
      const r = simulateHouse(i);
      expect(r.selfConsumption).toBeGreaterThanOrEqual(0);
      expect(r.selfConsumption).toBeLessThanOrEqual(1);
      expect(r.selfSufficiency).toBeGreaterThanOrEqual(0);
      expect(r.selfSufficiency).toBeLessThanOrEqual(1);
    }
  });

  it("reads self-sufficiency off what the grid had to supply", () => {
    const r = simulateHouse(h({ solarW: 6000, batteryKWh: 10 }));
    expect(r.selfSufficiency).toBeCloseTo(1 - r.importKWhDay / r.loadKWhDay, 6);
  });
});

describe("money", () => {
  it("bills the no-solar case at the full tariff, EV included", () => {
    const r = simulateHouse(
      h({ monthlyBill: 3000, tariff: 4, occupancy: 1, evOn: true, evKWhPerDay: 10 }),
    );
    expect(r.billNoSolar).toBeCloseTo(3000 + 10 * 30 * 4, 6);
  });

  it("nets export earnings off the import bill", () => {
    const r = simulateHouse(h({ solarW: 8000, tariff: 4.5, sellPrice: 2 }));
    expect(r.billNow).toBeCloseTo(
      r.importKWhDay * 30 * 4.5 - r.exportKWhDay * 30 * 2,
      4,
    );
    expect(r.monthlySaving).toBeCloseTo(r.billNoSolar - r.billNow, 4);
  });

  it("saves more as the tariff rises", () => {
    const cheap = simulateHouse(h({ solarW: 6000, tariff: 3 }));
    const dear = simulateHouse(h({ solarW: 6000, tariff: 6 }));
    expect(dear.monthlySaving).toBeGreaterThan(cheap.monthlySaving);
  });

  it("prices the pack per kWh", () => {
    const r = simulateHouse(h({ batteryKWh: 12, batteryPricePerKWh: 900 }));
    expect(r.batteryCost).toBeCloseTo(12 * 900, 9);
  });
});

describe("battery payback is marginal, not the whole system's", () => {
  it("credits the battery only with what it adds over the same house without one", () => {
    const withB = simulateHouse(h({ solarW: 6000, batteryKWh: 10 }));
    const withoutB = simulateHouse(h({ solarW: 6000, batteryKWh: 0 }));
    expect(withB.batteryMonthlySaving).toBeCloseTo(
      withB.monthlySaving - withoutB.monthlySaving,
      6,
    );
    // The giveaway that the old bug is back: the battery claiming the solar's
    // saving too.
    expect(withB.batteryMonthlySaving).toBeLessThan(withB.monthlySaving);
  });

  it("divides the pack cost by twelve months of that marginal saving", () => {
    const r = simulateHouse(h({ solarW: 6000, batteryKWh: 10 }));
    expect(r.batteryPaybackYears).toBeCloseTo(
      r.batteryCost / (r.batteryMonthlySaving * 12),
      6,
    );
    // Sanity against the historical bug: a real pack does not pay back in
    // under a year at these prices.
    expect(r.batteryPaybackYears).toBeGreaterThan(1);
  });

  it("says Infinity rather than a negative when it never pays back", () => {
    // Export worth as much as import: the battery saves nothing by
    // time-shifting, so there is nothing to pay the pack back with.
    const r = simulateHouse(
      h({ solarW: 6000, batteryKWh: 10, tariff: 4, sellPrice: 4 }),
    );
    expect(r.batteryMonthlySaving).toBeLessThanOrEqual(1e-9);
    expect(r.batteryPaybackYears).toBe(Infinity);
  });

  it("reports zero, not Infinity, when there is no pack to pay off", () => {
    const r = simulateHouse(h({ batteryKWh: 0 }));
    expect(r.batteryPaybackYears).toBe(0);
    expect(r.batteryMonthlySaving).toBe(0);
    expect(r.batteryCost).toBe(0);
  });

  it("takes longer to pay off a more expensive pack", () => {
    const cheap = simulateHouse(h({ batteryKWh: 10, batteryPricePerKWh: 500 }));
    const dear = simulateHouse(h({ batteryKWh: 10, batteryPricePerKWh: 5000 }));
    expect(dear.batteryPaybackYears).toBeGreaterThan(cheap.batteryPaybackYears);
  });
});

describe("off-grid endurance", () => {
  it("counts only the usable pack above the floor, after round-trip loss", () => {
    const r = simulateHouse(h({ batteryKWh: 20, batteryRoundTrip: 1 }));
    const usable = 20 * 0.9; // 10% floor
    const avgLoadKW = r.loadKWhDay / 24;
    expect(r.offGridHours).toBeCloseTo(
      usable / Math.min(avgLoadKW, 20 * 0.5),
      4,
    );
  });

  it("lasts longer with a bigger pack and shorter with a bigger load", () => {
    const small = simulateHouse(h({ batteryKWh: 5 })).offGridHours;
    const big = simulateHouse(h({ batteryKWh: 30 })).offGridHours;
    expect(big).toBeGreaterThan(small);
    const hungry = simulateHouse(h({ batteryKWh: 30, occupancy: 1, evOn: true }));
    expect(hungry.offGridHours).toBeLessThan(big);
  });

  it("is zero without a pack", () => {
    expect(simulateHouse(h({ batteryKWh: 0 })).offGridHours).toBe(0);
  });
});

describe("carbon", () => {
  it("credits only solar that displaces real load, at the grid factor", () => {
    const r = simulateHouse(h({ solarW: 6000, batteryKWh: 10 }));
    expect(r.co2AvoidedKgYear).toBeGreaterThan(0);
    // Capped by the load: exporting to the grid all day doesn't multiply the
    // household's own avoided emissions without limit.
    expect(r.co2AvoidedKgYear).toBeLessThanOrEqual(r.loadKWhDay * 365 * 0.5 + 1e-6);
  });

  it("avoids nothing with no solar", () => {
    expect(simulateHouse(h({ solarW: 0 })).co2AvoidedKgYear).toBe(0);
  });
});

describe("no NaN or Infinity anywhere the sliders can reach", () => {
  const finite = (r: ReturnType<typeof simulateHouse>) =>
    Object.entries(r)
      .filter(([k]) => k !== "hourly" && k !== "batteryPaybackYears")
      .every(([, v]) => typeof v !== "number" || Number.isFinite(v));

  it.each([
    ["no solar, no battery", h({ solarW: 0, batteryKWh: 0 })],
    ["zero occupancy", h({ occupancy: 0 })],
    ["zero bill", h({ monthlyBill: 0 })],
    ["round trip at the floor", h({ batteryRoundTrip: 0 })],
    ["everything maxed", h({ solarW: 20000, batteryKWh: 100, occupancy: 1, evOn: true })],
  ])("%s", (_label, input) => {
    const r = simulateHouse(input);
    expect(finite(r)).toBe(true);
    expect(r.hourly.every((x) => Number.isFinite(x.soc) && Number.isFinite(x.load))).toBe(
      true,
    );
  });
});
