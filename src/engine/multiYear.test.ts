import { describe, it, expect } from "vitest";
import { projectMultiYear, DEFAULT_MULTI_YEAR } from "./multiYear";
import { DEFAULT_INPUTS } from "@/data/constants";
import type { KPIs, SimInputs } from "@/data/types";

/**
 * The 20-year projection is where a quiet arithmetic slip does the most
 * damage: every number it produces is plausible, nobody can check it by eye,
 * and the payback year it reports is the headline the whole app is built
 * around. So these drive it with a synthetic KPI set — round numbers, chosen
 * so the expected answer can be worked out by hand — rather than with the
 * engine's own output, which would only prove the two agree with each other.
 */

/** ฿100B capex, ฿10B/yr revenue split across the named streams, ฿1B/yr opex. */
const KPIS: KPIs = {
  dailySupplyGWh: 0,
  dailyDemandGWh: 0,
  dailySurplusGWh: 0,
  dailyImportGWh: 0,
  dailyExportGWh: 0,
  batteryCyclesPerDay: 0,
  batteryMinSoC: 0,
  batteryMaxSoC: 0,
  batteryLifespanYears: 0,
  yearlyDemandGWh: 0,
  yearlyEmissionTon: 0,
  yearlyCaptureTon: 0,
  netCarbonTon: 0,
  carbonCreditRevenue: 4e9,
  methanolRevenue: 3e9,
  dcLeasingRevenue: 1e9,
  costAvoidance: 2e9,
  costAvoidanceEvSensitive: 1e9,
  hydrogenCoProductRevenue: 0,
  oxygenTonPerYear: 0,
  wasteHeatGWhPerYear: 0,
  totalAnnualValue: 10e9,
  capexEstimate: 100e9,
  opexEstimate: 1e9,
  paybackYears: 10,
};

const INPUTS: SimInputs = {
  ...DEFAULT_INPUTS,
  batteryGWh: 20,
  batteryPricePerKWh: 500,
  lifestyleGWhPerDay: 7.5,
};

/** Everything switched off, so one mechanism can be examined at a time. */
const FLAT = {
  ...DEFAULT_MULTI_YEAR,
  years: 10,
  opexInflation: 0,
  discountRate: 0,
  batteryDegradation: 0,
  augmentationEnabled: false,
  carbonPriceGrowth: 0,
  carbonPriceUncertainty: 0,
  evAdoptionCeiling: 0.05, // parked at the year-0 assumption: no EV growth
  evLoadMultiplier: 1,
};

describe("the flat case — nothing growing, nothing decaying", () => {
  it("repeats the same year, and pays back exactly on schedule", () => {
    const { rows, paybackYear, totalLifetimeNet } = projectMultiYear(
      KPIS,
      INPUTS,
      FLAT,
    );
    expect(rows).toHaveLength(10);
    expect(rows[0].revenue).toBeCloseTo(10e9, 0);
    expect(rows[0].opex).toBeCloseTo(1e9, 0);
    expect(rows[0].net).toBeCloseTo(9e9, 0);
    // -100B capex, +9B a year → crosses zero during year 12, i.e. never
    // inside a 10-year horizon.
    expect(paybackYear).toBeNull();
    expect(totalLifetimeNet).toBeCloseTo(-100e9 + 10 * 9e9, 0);
  });

  it("reports the payback year the cumulative actually crosses in", () => {
    const { rows, paybackYear } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 20,
    });
    expect(paybackYear).toBe(12); // 12 × 9B = 108B > 100B, 11 × 9B = 99B < 100B
    expect(rows[10].cumulative).toBeLessThan(0);
    expect(rows[11].cumulative).toBeGreaterThanOrEqual(0);
  });

  it("starts the cumulative at minus the capex", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, FLAT);
    expect(rows[0].cumulative).toBeCloseTo(-100e9 + 9e9, 0);
  });
});

describe("battery degradation and augmentation", () => {
  it("compounds the loss when augmentation is off", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      batteryDegradation: 0.02,
    });
    // Compounding, not linear: year 3 is 0.98³, not 1 − 3×0.02.
    expect(rows[2].batteryEffectiveGWh).toBeCloseTo(20 * 0.98 ** 3, 9);
    expect(rows[2].batteryEffectiveGWh).not.toBeCloseTo(20 * (1 - 3 * 0.02), 6);
    expect(rows.every((r) => r.augmentation === 0)).toBe(true);
  });

  it("restores rated capacity every year when augmentation is on", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      batteryDegradation: 0.02,
      augmentationEnabled: true,
    });
    expect(rows.every((r) => r.batteryEffectiveGWh === 20)).toBe(true);
    expect(rows.every((r) => r.augmentation > 0)).toBe(true);
  });

  it("prices the first top-up at today's cell price", () => {
    // 20 GWh × 2% = 0.4 GWh = 400,000 kWh at ฿500 → ฿200M, no discount in y1.
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      batteryDegradation: 0.02,
      augmentationEnabled: true,
    });
    expect(rows[0].augmentation).toBeCloseTo(0.4 * 1e6 * 500, 0);
  });

  it("gets cheaper each year on the learning curve", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      batteryDegradation: 0.02,
      augmentationEnabled: true,
    });
    // Same gap every year, so any change is the 5%/yr price decline alone.
    expect(rows[1].augmentation).toBeCloseTo(rows[0].augmentation * 0.95, 0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].augmentation).toBeLessThan(rows[i - 1].augmentation);
    }
  });

  it("charges augmentation to opex as well as reporting it separately", () => {
    // Reporting it without spending it would make the plan look free.
    const { rows, totalAugmentation } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      batteryDegradation: 0.02,
      augmentationEnabled: true,
    });
    expect(rows[0].opex).toBeCloseTo(1e9 + rows[0].augmentation, 0);
    expect(totalAugmentation).toBeCloseTo(
      rows.reduce((a, r) => a + r.augmentation, 0),
      0,
    );
  });

  it("spends nothing on a battery that never degrades", () => {
    const { totalAugmentation } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      batteryDegradation: 0,
      augmentationEnabled: true,
    });
    expect(totalAugmentation).toBe(0);
  });
});

describe("EV adoption S-curve", () => {
  it("is exactly half the ceiling at the midpoint year", () => {
    const opts = {
      ...FLAT,
      years: 20,
      evAdoptionCeiling: 0.8,
      evAdoptionMidpoint: 8,
    };
    const { rows } = projectMultiYear(KPIS, INPUTS, opts);
    expect(rows[7].evPenetration).toBeCloseTo(0.4, 9); // year 8
  });

  it("rises monotonically towards the ceiling without passing it", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 30,
      evAdoptionCeiling: 0.85,
    });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].evPenetration).toBeGreaterThan(rows[i - 1].evPenetration);
    }
    expect(rows.at(-1)!.evPenetration).toBeLessThan(0.85);
    expect(rows.at(-1)!.evPenetration).toBeGreaterThan(0.84);
  });

  it("makes a steeper curve overtake a shallower one after the midpoint", () => {
    const shallow = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 20,
      evAdoptionSteepness: 0.2,
    });
    const steep = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 20,
      evAdoptionSteepness: 0.6,
    });
    const mid = DEFAULT_MULTI_YEAR.evAdoptionMidpoint;
    expect(steep.rows[mid + 3].evPenetration).toBeGreaterThan(
      shallow.rows[mid + 3].evPenetration,
    );
    expect(steep.rows[1].evPenetration).toBeLessThan(
      shallow.rows[1].evPenetration,
    );
  });

  it("grows the lifestyle load with adoption, and never shrinks it", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 20,
      evAdoptionCeiling: 0.85,
      evLoadMultiplier: 1.6,
    });
    expect(rows[0].lifestyleGWhPerDay).toBeGreaterThanOrEqual(7.5);
    expect(rows.at(-1)!.lifestyleGWhPerDay).toBeGreaterThan(
      rows[0].lifestyleGWhPerDay,
    );
    // Math.max(1, …) floor: adoption below the 5% year-0 assumption must not
    // scale the load *down* and hand the plan a saving it never earned.
    const shrinking = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 5,
      evAdoptionCeiling: 0.01,
      evLoadMultiplier: 1.6,
    });
    expect(
      shrinking.rows.every((r) => r.lifestyleGWhPerDay >= 7.5),
    ).toBe(true);
  });

  it("lifts only the EV-sensitive slice of cost avoidance", () => {
    const grown = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 20,
      evAdoptionCeiling: 0.85,
      evLoadMultiplier: 1.6,
    });
    const flat = projectMultiYear(KPIS, INPUTS, { ...FLAT, years: 20 });
    const extra = grown.rows.at(-1)!.revenue - flat.rows.at(-1)!.revenue;
    // Only ฿1B of the ฿2B avoidance is EV-sensitive, so the extra can never
    // exceed 0.6 × that slice however hard adoption runs.
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThanOrEqual(1e9 * 0.6 + 1);
  });
});

describe("carbon price band", () => {
  it("collapses to the mid case when uncertainty is zero", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      carbonPriceGrowth: 0.04,
    });
    expect(rows.every((r) => r.revenueLow === r.revenue)).toBe(true);
    expect(rows.every((r) => r.revenueHigh === r.revenue)).toBe(true);
  });

  it("widens with time, reaching the full range at the horizon", () => {
    const opts = { ...FLAT, years: 10, carbonPriceUncertainty: 0.4 };
    const { rows } = projectMultiYear(KPIS, INPUTS, opts);
    const spread = (i: number) => rows[i].revenueHigh - rows[i].revenueLow;
    expect(spread(0)).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect(spread(i)).toBeGreaterThan(spread(i - 1));
    }
    // sqrt(years/years) = 1 → the last year carries the full ±40% on ฿4B.
    expect(rows.at(-1)!.revenueHigh - rows.at(-1)!.revenue).toBeCloseTo(
      4e9 * 0.4,
      0,
    );
  });

  it("compounds growth, and drifts methanol and DC at half the carbon rate", () => {
    // Spelling the whole year out pins the composition, not just the total:
    // carbon rises at the full rate while the methanol and data-centre
    // contracts are modelled as tracking it at half speed. Nothing in the
    // chart would reveal those being swapped, or turned into simple interest.
    const g = 0.1;
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      carbonPriceGrowth: g,
    });
    const expectedAt = (year: number) => {
      const n = year - 1;
      return (
        4e9 * (1 + g) ** n + // carbon credits
        3e9 * (1 + 0.5 * g) ** n + // methanol
        1e9 * (1 + 0.5 * g) ** n + // data centre leasing
        1e9 + // flat cost avoidance
        1e9 // EV-sensitive avoidance, unscaled in the flat case
      );
    };
    expect(rows[0].revenue).toBeCloseTo(expectedAt(1), 0);
    expect(rows[2].revenue).toBeCloseTo(expectedAt(3), 0);
    expect(rows[9].revenue).toBeCloseTo(expectedAt(10), 0);
    // Compounding, not simple interest.
    expect(rows[9].revenue).not.toBeCloseTo(
      4e9 * (1 + 9 * g) + 3e9 + 1e9 + 2e9,
      0,
    );
  });

  it("orders low ≤ mid ≤ high everywhere", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, DEFAULT_MULTI_YEAR);
    for (const r of rows) {
      expect(r.revenueLow).toBeLessThanOrEqual(r.revenue);
      expect(r.revenue).toBeLessThanOrEqual(r.revenueHigh);
      expect(r.cumulativeLow).toBeLessThanOrEqual(r.cumulative);
      expect(r.cumulative).toBeLessThanOrEqual(r.cumulativeHigh);
    }
  });
});

describe("opex inflation and discounting", () => {
  it("leaves the first year uninflated and compounds after", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      opexInflation: 0.03,
    });
    expect(rows[0].opex).toBeCloseTo(1e9, 0);
    expect(rows[2].opex).toBeCloseTo(1e9 * 1.03 ** 2, 0);
  });

  it("discounts later years harder, pushing payback out", () => {
    const undiscounted = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 20,
    });
    const discounted = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 20,
      discountRate: 0.06,
    });
    expect(discounted.totalLifetimeNet).toBeLessThan(
      undiscounted.totalLifetimeNet,
    );
    expect(discounted.paybackYear).toBeGreaterThan(undiscounted.paybackYear!);
  });

  it("applies the discount from year 1, not year 0", () => {
    const { rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      discountRate: 0.1,
    });
    expect(rows[0].cumulative).toBeCloseTo(-100e9 + 9e9 / 1.1, 0);
  });
});

describe("IRR", () => {
  it("finds a rate that zeroes the NPV", () => {
    const { irrApprox, rows } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 20,
    });
    const npv = rows.reduce(
      (sum, r, i) => sum + r.net / (1 + irrApprox) ** (i + 1),
      -100e9,
    );
    expect(Math.abs(npv)).toBeLessThan(1e6); // ฿1M on ฿100B
    expect(irrApprox).toBeGreaterThan(0.05);
    expect(irrApprox).toBeLessThan(0.09);
  });

  it("returns NaN when no rate in range can pay the capex back", () => {
    // ฿100B out, ฿9B a year for two years: nothing bracketed, so say so
    // rather than returning the edge of the search range as if it were real.
    const { irrApprox } = projectMultiYear(KPIS, INPUTS, {
      ...FLAT,
      years: 2,
    });
    expect(Number.isNaN(irrApprox)).toBe(true);
  });

  it("rises when the same capex earns more", () => {
    const lean = projectMultiYear(KPIS, INPUTS, { ...FLAT, years: 20 });
    const rich = projectMultiYear(
      { ...KPIS, methanolRevenue: 8e9, totalAnnualValue: 15e9 },
      INPUTS,
      { ...FLAT, years: 20 },
    );
    expect(rich.irrApprox).toBeGreaterThan(lean.irrApprox);
  });
});

describe("horizon", () => {
  it("emits exactly one row per year, numbered from 1", () => {
    for (const years of [1, 5, 30]) {
      const { rows } = projectMultiYear(KPIS, INPUTS, { ...FLAT, years });
      expect(rows).toHaveLength(years);
      expect(rows[0].year).toBe(1);
      expect(rows.at(-1)!.year).toBe(years);
    }
  });

  it("ends the cumulative on the same number it reports as lifetime net", () => {
    const { rows, totalLifetimeNet } = projectMultiYear(
      KPIS,
      INPUTS,
      DEFAULT_MULTI_YEAR,
    );
    expect(rows.at(-1)!.cumulative).toBeCloseTo(totalLifetimeNet, 6);
  });
});
