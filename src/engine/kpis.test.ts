import { describe, it, expect } from "vitest";
import { computeDemandSizes, computeKPIs, simulateDay } from "./simulate";
import {
  DEFAULT_INPUTS,
  ENERGY_INTENSITY as E,
  ANNUAL_DEMAND_FACTOR,
  PLANT_REFERENCE,
  USD_TO_THB,
} from "@/data/constants";
import type { SimInputs } from "@/data/types";

/**
 * The arithmetic behind every number the app puts on screen: what each mission
 * costs to run, what the plan earns, what it costs to build, and when it pays
 * back. None of it can be checked by eye — ฿519B is exactly as believable as
 * ฿419B — so the tests work each formula out independently from the same
 * inputs and compare. A test that called the engine to produce its own
 * expected value would agree with it however wrong both were.
 *
 * Where a constant is baked into the model (the 500k-ton baseline, the 2.5%
 * OPEX, the ฿25M/MW solar) it's written out here as a number. That's the
 * point: these are the assumptions, and changing one should break a test and
 * make someone say so out loud.
 */

const DAYS = 365;
const HOURS = 24;

const inp = (over: Partial<SimInputs> = {}): SimInputs => ({
  ...DEFAULT_INPUTS,
  ...over,
});

const kpisOf = (i: SimInputs) => computeKPIs(i, simulateDay(i));

/** Nothing running, nothing built — a clean slate to add one thing to. */
const EMPTY = inp({
  solarMW: 0,
  windMW: 0,
  biomassMW: 0,
  hydroMW: 0,
  batteryGWh: 0,
  lifestyleGWhPerDay: 0,
  dacOn: false,
  methanolOn: false,
  dataCenterOn: false,
  desalOn: false,
  wasteOn: false,
  wwtOn: false,
});

describe("computeDemandSizes — energy intensity per mission", () => {
  it("sizes DAC from tonnes captured", () => {
    const d = computeDemandSizes(inp({ dacTargetMtPerYear: 1.5 }));
    // 1.5 Mt × 2500 kWh/t = 3.75 TWh/yr
    expect(d.dac * DAYS).toBeCloseTo((1.5e6 * E.dacKWhPerTon) / 1e6, 6);
  });

  it("sizes methanol from electrolysis plus synthesis, not one or the other", () => {
    const kt = 500;
    const d = computeDemandSizes(inp({ methanolKtPerYear: kt }));
    const tons = kt * 1e3;
    const expected =
      (tons * E.h2PerMethanolTon * E.electrolyzerKWhPerKgH2 +
        tons * E.methanolSynthesisKWhPerTon) /
      1e6;
    expect(d.methanol * DAYS).toBeCloseTo(expected, 6);
    // Electrolysis dominates; dropping synthesis would still look plausible.
    expect(d.methanol * DAYS).toBeGreaterThan(
      (tons * E.h2PerMethanolTon * E.electrolyzerKWhPerKgH2) / 1e6,
    );
  });

  it("sizes the data centre as flat power around the clock", () => {
    const d = computeDemandSizes(inp({ dataCenterMW: 200 }));
    expect(d.dataCenter).toBeCloseTo((200 * HOURS) / 1000, 9);
  });

  it("sizes desalination per cubic metre", () => {
    const d = computeDemandSizes(inp({ desalMm3PerYear: 250 }));
    expect(d.desal * DAYS).toBeCloseTo((250e6 * E.desalKWhPerM3) / 1e6, 6);
  });

  it("sizes the plasma plant per tonne of waste", () => {
    const d = computeDemandSizes(inp({ wasteTonPerDay: 1000 }));
    expect(d.waste).toBeCloseTo((1000 * E.plasmaKWhPerTon) / 1e6, 9);
  });

  it("sizes wastewater from population, coverage and litres per head", () => {
    const d = computeDemandSizes(inp({ wwtCoverage: 1 }));
    const m3PerYear =
      (E.populationPhet2046 * E.wwtLitersPerPersonPerDay * DAYS) / 1000;
    expect(d.wwt * DAYS).toBeCloseTo((m3PerYear * E.wwtKWhPerM3) / 1e6, 6);
  });

  it("scales wastewater linearly with coverage", () => {
    const full = computeDemandSizes(inp({ wwtCoverage: 1 })).wwt;
    const half = computeDemandSizes(inp({ wwtCoverage: 0.5 })).wwt;
    expect(half).toBeCloseTo(full / 2, 9);
  });

  it.each([
    ["dacOn", "dac"],
    ["methanolOn", "methanol"],
    ["dataCenterOn", "dataCenter"],
    ["desalOn", "desal"],
    ["wasteOn", "waste"],
    ["wwtOn", "wwt"],
  ] as const)("%s off means zero %s demand", (toggle, field) => {
    const d = computeDemandSizes(inp({ [toggle]: false } as Partial<SimInputs>));
    expect(d[field]).toBe(0);
  });

  it("applies the seasonal cooling factor to lifestyle and to nothing else", () => {
    // The annual total has to match what simulateDay charges day by day, or a
    // yearly KPI and daily×365 drift apart — which they did, by 3.6%.
    const d = computeDemandSizes(inp({ lifestyleGWhPerDay: 10 }));
    const missions = d.dac + d.methanol + d.dataCenter + d.desal + d.waste + d.wwt;
    expect(d.totalAnnualGWh).toBeCloseTo(
      10 * ANNUAL_DEMAND_FACTOR * DAYS + missions * DAYS,
      4,
    );
    expect(ANNUAL_DEMAND_FACTOR).toBeGreaterThan(1); // summer-weighted
  });

  it("reports lifestyle per day unscaled — the factor is an annual thing", () => {
    expect(computeDemandSizes(inp({ lifestyleGWhPerDay: 7.5 })).lifestyle).toBe(7.5);
  });
});

describe("carbon", () => {
  it("holds the gross baseline constant and subtracts what DAC captures", () => {
    const k = kpisOf(inp({ dacTargetMtPerYear: 1.2 }));
    expect(k.yearlyEmissionTon).toBe(500_000);
    expect(k.yearlyCaptureTon).toBe(1.2e6);
    expect(k.netCarbonTon).toBe(500_000 - 1.2e6);
    expect(k.netCarbonTon).toBeLessThan(0); // net negative at this target
  });

  it("captures nothing with DAC off, and stays net positive", () => {
    const k = kpisOf(inp({ dacOn: false }));
    expect(k.yearlyCaptureTon).toBe(0);
    expect(k.netCarbonTon).toBe(500_000);
    expect(k.carbonCreditRevenue).toBe(0);
  });

  it("prices credits per captured tonne in baht", () => {
    const k = kpisOf(inp({ dacTargetMtPerYear: 1, carbonPrice: 150 }));
    expect(k.carbonCreditRevenue).toBeCloseTo(1e6 * 150 * USD_TO_THB, 0);
  });
});

describe("methanol — a tonne is sold or burned, never both", () => {
  const base = inp({ methanolKtPerYear: 1000, methanolPrice: 500, fuelPrice: 40 });

  it("splits export revenue and fuel saving by localShare", () => {
    const k = kpisOf(inp({ ...base, methanolLocalShare: 0.3 }));
    const tons = 1e6;
    expect(k.methanolRevenue).toBeCloseTo(tons * 0.7 * 500 * USD_TO_THB, 0);
    // Fuel avoided only on the 30% burned here.
    const fuelSaving = tons * 0.3 * 600 * (40 * 0.5);
    expect(k.costAvoidance - k.costAvoidanceEvSensitive).toBeGreaterThan(
      fuelSaving * 0.99,
    );
  });

  it("earns export revenue and no fuel saving at 0% local", () => {
    const all = kpisOf(inp({ ...base, methanolLocalShare: 0 }));
    const none = kpisOf(inp({ ...base, methanolOn: false }));
    expect(all.methanolRevenue).toBeCloseTo(1e6 * 500 * USD_TO_THB, 0);
    // Cost avoidance identical to a run with no methanol at all: no fuel
    // displaced when every tonne leaves the province.
    expect(all.costAvoidance).toBeCloseTo(none.costAvoidance, 0);
  });

  it("earns no export revenue at 100% local", () => {
    const k = kpisOf(inp({ ...base, methanolLocalShare: 1 }));
    expect(k.methanolRevenue).toBe(0);
  });

  it("never counts the same tonne twice as the split moves", () => {
    // Export revenue falls exactly as fast as fuel saving rises; the two can't
    // both be claimed on one molecule.
    const at = (share: number) => kpisOf(inp({ ...base, methanolLocalShare: share }));
    const a = at(0.2);
    const b = at(0.8);
    const exportDrop = a.methanolRevenue - b.methanolRevenue;
    const fuelGain = b.costAvoidance - a.costAvoidance;
    expect(exportDrop).toBeGreaterThan(0);
    expect(fuelGain).toBeGreaterThan(0);
    // Different unit prices, so not equal — but both strictly proportional to
    // the 0.6 of tonnage that moved.
    expect(exportDrop).toBeCloseTo(1e6 * 0.6 * 500 * USD_TO_THB, 0);
    expect(fuelGain).toBeCloseTo(1e6 * 0.6 * 600 * (40 * 0.5), 0);
  });

  it("clamps a hostile share into 0..1", () => {
    expect(kpisOf(inp({ ...base, methanolLocalShare: 5 })).methanolRevenue).toBe(0);
    expect(
      kpisOf(inp({ ...base, methanolLocalShare: -3 })).methanolRevenue,
    ).toBeCloseTo(kpisOf(inp({ ...base, methanolLocalShare: 0 })).methanolRevenue, 0);
  });
});

describe("data centre leasing", () => {
  it("bills nameplate power round the clock at the lease take-rate", () => {
    const k = kpisOf(inp({ dataCenterMW: 100, gridSellPrice: 5 }));
    expect(k.dcLeasingRevenue).toBeCloseTo(100 * HOURS * DAYS * 1000 * 5 * 0.4, 0);
  });

  it("earns nothing switched off", () => {
    expect(kpisOf(inp({ dataCenterOn: false })).dcLeasingRevenue).toBe(0);
  });
});

describe("cost avoidance", () => {
  it("counts lifestyle electricity with the seasonal factor", () => {
    const k = kpisOf(
      inp({ ...EMPTY, lifestyleGWhPerDay: 5, gridBuyPrice: 4, solarMW: 1000 }),
    );
    expect(k.costAvoidanceEvSensitive).toBeCloseTo(
      5 * ANNUAL_DEMAND_FACTOR * DAYS * 1e6 * 4,
      0,
    );
  });

  it("counts services without it — only cooling load follows the season", () => {
    const i = inp({ ...EMPTY, desalOn: true, desalMm3PerYear: 100, gridBuyPrice: 4 });
    const d = computeDemandSizes(i);
    const k = kpisOf(i);
    expect(k.costAvoidanceEvSensitive).toBe(0);
    expect(k.costAvoidance).toBeCloseTo(d.desal * DAYS * 1e6 * 4, 0);
  });

  it("keeps the EV-sensitive slice a strict part of the whole", () => {
    const k = kpisOf(DEFAULT_INPUTS);
    expect(k.costAvoidanceEvSensitive).toBeGreaterThan(0);
    expect(k.costAvoidanceEvSensitive).toBeLessThan(k.costAvoidance);
  });
});

describe("hydrogen co-products", () => {
  it("prices oxygen off the electrolysis stoichiometry", () => {
    const kt = 727;
    const k = kpisOf(inp({ ...EMPTY, methanolOn: true, methanolKtPerYear: kt }));
    const h2Kg = kt * 1e3 * E.h2PerMethanolTon;
    expect(k.oxygenTonPerYear).toBeCloseTo((h2Kg * 8) / 1000, 3);
  });

  it("recovers a fifth of the electrolyser's energy as usable heat", () => {
    const kt = 727;
    const k = kpisOf(inp({ ...EMPTY, methanolOn: true, methanolKtPerYear: kt }));
    const h2Kg = kt * 1e3 * E.h2PerMethanolTon;
    expect(k.wasteHeatGWhPerYear).toBeCloseTo(
      (h2Kg * E.electrolyzerKWhPerKgH2 * 0.2) / 1e6,
      6,
    );
  });

  it("adds oxygen and heat, at ฿5/kg and ฿1.5/kWh-th", () => {
    const k = kpisOf(inp({ ...EMPTY, methanolOn: true, methanolKtPerYear: 727 }));
    expect(k.hydrogenCoProductRevenue).toBeCloseTo(
      k.oxygenTonPerYear * 1000 * 5 + k.wasteHeatGWhPerYear * 1e6 * 1.5,
      0,
    );
  });

  it("produces none without methanol", () => {
    const k = kpisOf(inp({ methanolOn: false }));
    expect(k.oxygenTonPerYear).toBe(0);
    expect(k.wasteHeatGWhPerYear).toBe(0);
    expect(k.hydrogenCoProductRevenue).toBe(0);
  });
});

describe("totalAnnualValue is the sum of its parts and nothing else", () => {
  it("adds the five streams exactly", () => {
    const k = kpisOf(DEFAULT_INPUTS);
    expect(k.totalAnnualValue).toBeCloseTo(
      k.carbonCreditRevenue +
        k.methanolRevenue +
        k.dcLeasingRevenue +
        k.costAvoidance +
        k.hydrogenCoProductRevenue,
      0,
    );
  });
});

describe("CAPEX", () => {
  it("prices generation per MW at the documented rates", () => {
    const solar = kpisOf(inp({ ...EMPTY, solarMW: 100 })).capexEstimate;
    const wind = kpisOf(inp({ ...EMPTY, windMW: 100 })).capexEstimate;
    const bio = kpisOf(inp({ ...EMPTY, biomassMW: 100 })).capexEstimate;
    expect(solar).toBeCloseTo(100 * 25e6, 0);
    expect(wind).toBeCloseTo(100 * 50e6, 0);
    expect(bio).toBeCloseTo(100 * 80e6, 0);
    // Distinct rates, so a copy-paste between them would show up here.
    expect(wind).toBeCloseTo(solar * 2, 0);
    expect(bio).toBeGreaterThan(wind);
  });

  it("prices the battery per kWh of nameplate", () => {
    const k = kpisOf(inp({ ...EMPTY, batteryGWh: 10, batteryPricePerKWh: 500 }));
    expect(k.capexEstimate).toBeCloseTo(10 * 1e6 * 500, 0);
  });

  it("charges nothing for hydro — it isn't in the build cost", () => {
    // Documenting the model rather than endorsing it: hydro is treated as
    // existing capacity, so a scenario that adds some pays nothing for it.
    expect(kpisOf(inp({ ...EMPTY, hydroMW: 50 })).capexEstimate).toBe(0);
  });

  it("bills a plant pro-rata to the throughput actually built", () => {
    // Keying off the on/off toggle alone once billed ฿125B to a 2026 scenario
    // whose plants produced nothing.
    const half = kpisOf(
      inp({
        ...EMPTY,
        dacOn: true,
        dacTargetMtPerYear: PLANT_REFERENCE.dacMtPerYear / 2,
        smartDispatch: false,
      }),
    ).capexEstimate;
    const full = kpisOf(
      inp({
        ...EMPTY,
        dacOn: true,
        dacTargetMtPerYear: PLANT_REFERENCE.dacMtPerYear,
        smartDispatch: false,
      }),
    ).capexEstimate;
    expect(half).toBeCloseTo(full / 2, -3);
  });

  it("caps the pro-rata at one reference plant", () => {
    // Math.min(1, …): four times the throughput is not four times the lump.
    const one = kpisOf(
      inp({
        ...EMPTY,
        dacOn: true,
        dacTargetMtPerYear: PLANT_REFERENCE.dacMtPerYear,
        smartDispatch: false,
      }),
    ).capexEstimate;
    const four = kpisOf(
      inp({
        ...EMPTY,
        dacOn: true,
        dacTargetMtPerYear: PLANT_REFERENCE.dacMtPerYear * 4,
        smartDispatch: false,
      }),
    ).capexEstimate;
    expect(four).toBeCloseTo(one, -3);
  });

  it("charges nothing for a plant that is on but building none of itself", () => {
    expect(
      kpisOf(inp({ ...EMPTY, dacOn: true, dacTargetMtPerYear: 0 })).capexEstimate,
    ).toBe(0);
  });

  it.each([
    ["dacOn", "dacTargetMtPerYear", 30e9, PLANT_REFERENCE.dacMtPerYear],
    ["methanolOn", "methanolKtPerYear", 50e9, PLANT_REFERENCE.methanolKtPerYear],
    ["dataCenterOn", "dataCenterMW", 20e9, PLANT_REFERENCE.dataCenterMW],
    ["desalOn", "desalMm3PerYear", 15e9, PLANT_REFERENCE.desalMm3PerYear],
    ["wasteOn", "wasteTonPerDay", 10e9, PLANT_REFERENCE.wasteTonPerDay],
  ] as const)("charges %s its own lump sum at reference scale", (toggle, target, lump, ref) => {
    const k = kpisOf(
      inp({
        ...EMPTY,
        [toggle]: true,
        [target]: ref,
        smartDispatch: false,
      } as Partial<SimInputs>),
    );
    // Flat dispatch, so peak/average is 1 and the lump arrives undistorted.
    expect(k.capexEstimate).toBeCloseTo(lump, -6);
  });

  it("charges more for a plant pushed into the sunny hours", () => {
    // Smart dispatch buys a bigger plant to chase surplus; leaving that out
    // would make load-shifting look free.
    const common = {
      solarMW: 8000,
      windMW: 2000,
      dacOn: true,
      dacTargetMtPerYear: 1,
      methanolOn: false,
      dataCenterOn: false,
      desalOn: false,
      wasteOn: false,
      wwtOn: false,
    };
    const flat = kpisOf(inp({ ...common, smartDispatch: false })).capexEstimate;
    const shifted = kpisOf(inp({ ...common, smartDispatch: true })).capexEstimate;
    expect(shifted).toBeGreaterThan(flat);
  });
});

describe("OPEX and payback", () => {
  it("takes OPEX as 2.5% of what was built", () => {
    const k = kpisOf(DEFAULT_INPUTS);
    expect(k.opexEstimate).toBeCloseTo(k.capexEstimate * 0.025, 0);
  });

  it("pays back over the net of value minus OPEX", () => {
    const k = kpisOf(DEFAULT_INPUTS);
    expect(k.paybackYears).toBeCloseTo(
      k.capexEstimate / (k.totalAnnualValue - k.opexEstimate),
      6,
    );
  });

  it("reports 99 rather than a negative when it never pays back", () => {
    // OPEX above the annual take: dividing anyway gives a negative payback,
    // which would sort and colour as if it were excellent.
    const k = kpisOf(
      inp({
        ...EMPTY,
        solarMW: 20000,
        carbonPrice: 0,
        gridBuyPrice: 0,
        gridSellPrice: 0,
        fuelPrice: 0,
      }),
    );
    expect(k.totalAnnualValue - k.opexEstimate).toBeLessThanOrEqual(0);
    expect(k.paybackYears).toBe(99);
  });
});

describe("battery lifespan", () => {
  it("is zero when there is no battery", () => {
    const k = kpisOf(inp({ batteryGWh: 0 }));
    expect(k.batteryLifespanYears).toBe(0);
    expect(k.batteryCyclesPerDay).toBe(0);
    expect(k.batteryMinSoC).toBe(0);
  });

  it("caps at 40 years however lightly it is worked", () => {
    // 5000 cycles / (cycles-per-day × 365) runs away as cycling approaches
    // zero; nobody should read "99 years" off a battery.
    const k = kpisOf(inp({ batteryGWh: 200, solarMW: 20000 }));
    expect(k.batteryLifespanYears).toBeLessThanOrEqual(40);
  });

  it("shortens as the battery is cycled harder", () => {
    const big = kpisOf(inp({ batteryGWh: 60 })).batteryLifespanYears;
    const small = kpisOf(inp({ batteryGWh: 5 })).batteryLifespanYears;
    expect(small).toBeLessThan(big);
    expect(small).toBeGreaterThan(0);
  });
});

describe("daily aggregates tie out to the hourly trace", () => {
  it("sums supply, demand and the flows it reports", () => {
    const i = DEFAULT_INPUTS;
    const hourly = simulateDay(i);
    const k = computeKPIs(i, hourly);
    const sum = (f: (h: (typeof hourly)[number]) => number) =>
      hourly.reduce((a, h) => a + f(h), 0) / 1000;
    expect(k.dailySupplyGWh).toBeCloseTo(sum((h) => h.totalSupply), 9);
    expect(k.dailyDemandGWh).toBeCloseTo(sum((h) => h.totalDemand), 9);
    expect(k.dailyImportGWh).toBeCloseTo(sum((h) => h.gridImport), 9);
    expect(k.dailyExportGWh).toBeCloseTo(sum((h) => h.gridExport), 9);
    expect(k.dailySurplusGWh).toBeCloseTo(k.dailySupplyGWh - k.dailyDemandGWh, 9);
  });
});
