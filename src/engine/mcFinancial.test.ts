import { describe, it, expect } from "vitest";
import { runFinancialMC, DEFAULT_FIN_MC } from "./financialMC";
import { runMonteCarlo, DEFAULT_MC } from "./monteCarlo";
import { DEFAULT_INPUTS } from "@/data/constants";

/**
 * Both Monte Carlos answer a question of the form "how likely is this?", and a
 * wrong answer to that looks exactly like a right one. The properties worth
 * pinning are the ones that must hold for *any* correct implementation:
 * the same seed gives the same answer, zero uncertainty gives a single point,
 * more uncertainty gives a wider spread, and the reported probability really
 * is the fraction of samples that qualified.
 */

const small = { ...DEFAULT_FIN_MC, samples: 60, horizon: 20 };

describe("financial Monte Carlo", () => {
  it("is reproducible from its seed", () => {
    const a = runFinancialMC(DEFAULT_INPUTS, small);
    const b = runFinancialMC(DEFAULT_INPUTS, small);
    expect(a.lifetimeNet).toEqual(b.lifetimeNet);
    expect(a.paybackYears).toEqual(b.paybackYears);
  });

  it("gives a different draw for a different seed", () => {
    const a = runFinancialMC(DEFAULT_INPUTS, small);
    const b = runFinancialMC(DEFAULT_INPUTS, { ...small, seed: small.seed + 1 });
    expect(a.lifetimeNet).not.toEqual(b.lifetimeNet);
  });

  it("returns exactly the requested number of samples", () => {
    const r = runFinancialMC(DEFAULT_INPUTS, { ...small, samples: 25 });
    expect(r.lifetimeNet).toHaveLength(25);
    expect(r.paybackYears).toHaveLength(25);
  });

  it("collapses to a single deterministic point when nothing is uncertain", () => {
    // With every sd at zero the sampler must return the baseline unchanged;
    // any stray randomness left in the path shows up here as a spread.
    const certain = runFinancialMC(DEFAULT_INPUTS, {
      ...small,
      samples: 20,
      sd: {
        carbonPrice: 0,
        batteryPrice: 0,
        methanolPrice: 0,
        gridBuyPrice: 0,
        demand: 0,
      },
    });
    expect(new Set(certain.lifetimeNet).size).toBe(1);
    expect(certain.lifetimeNetB.p10).toBe(certain.lifetimeNetB.p90);
    expect(certain.probPaysBack === 0 || certain.probPaysBack === 1).toBe(true);
  });

  it("widens the outcome band as the inputs get less certain", () => {
    const spread = (mult: number) => {
      const r = runFinancialMC(DEFAULT_INPUTS, {
        ...small,
        samples: 120,
        sd: {
          carbonPrice: 0.1 * mult,
          batteryPrice: 0.1 * mult,
          methanolPrice: 0.1 * mult,
          gridBuyPrice: 0.1 * mult,
          demand: 0.05 * mult,
        },
      });
      return r.lifetimeNetB.p90 - r.lifetimeNetB.p10;
    };
    expect(spread(3)).toBeGreaterThan(spread(1));
  });

  it("reports probabilities that match the samples behind them", () => {
    const r = runFinancialMC(DEFAULT_INPUTS, small);
    const paidBack = r.paybackYears.filter((y) => y <= r.horizon).length;
    const positive = r.lifetimeNet.filter((n) => n > 0).length;
    expect(r.probPaysBack).toBeCloseTo(paidBack / r.paybackYears.length, 12);
    expect(r.probNetPositive).toBeCloseTo(positive / r.lifetimeNet.length, 12);
    expect(r.probPaysBack).toBeGreaterThanOrEqual(0);
    expect(r.probPaysBack).toBeLessThanOrEqual(1);
  });

  it("marks a sample that never pays back as horizon + 1, not as zero", () => {
    // Zero would read as "paid back immediately" and drag every percentile
    // the wrong way.
    const r = runFinancialMC(DEFAULT_INPUTS, { ...small, horizon: 3 });
    expect(r.paybackYears.every((y) => y >= 1 && y <= 4)).toBe(true);
    expect(r.paybackYears.some((y) => y === 4)).toBe(true);
    expect(r.probPaysBack).toBeLessThan(1);
  });

  it("orders its percentiles and reports lifetime net in ฿B", () => {
    const r = runFinancialMC(DEFAULT_INPUTS, small);
    expect(r.payback.p10).toBeLessThanOrEqual(r.payback.p50);
    expect(r.payback.p50).toBeLessThanOrEqual(r.payback.p90);
    const meanB = r.lifetimeNet.reduce((a, b) => a + b, 0) / r.lifetimeNet.length / 1e9;
    expect(r.lifetimeNetB.mean).toBeCloseTo(meanB, 6);
  });

  it("never produces a NaN, however wide the uncertainty", () => {
    // Prices are sampled from Normals and clamped at zero; a draw below zero
    // that slipped through would divide its way into NaN somewhere downstream.
    const wild = runFinancialMC(DEFAULT_INPUTS, {
      ...small,
      samples: 150,
      sd: {
        carbonPrice: 2,
        batteryPrice: 2,
        methanolPrice: 2,
        gridBuyPrice: 2,
        demand: 1.5,
      },
    });
    expect(wild.lifetimeNet.every(Number.isFinite)).toBe(true);
    expect(wild.paybackYears.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(wild.lifetimeNetB.p50)).toBe(true);
  });

  it("shortens payback when carbon is worth more", () => {
    const cheap = runFinancialMC(
      { ...DEFAULT_INPUTS, carbonPrice: 50 },
      { ...small, samples: 80 },
    );
    const dear = runFinancialMC(
      { ...DEFAULT_INPUTS, carbonPrice: 400 },
      { ...small, samples: 80 },
    );
    expect(dear.payback.p50).toBeLessThan(cheap.payback.p50);
    expect(dear.probPaysBack).toBeGreaterThanOrEqual(cheap.probPaysBack);
  });
});

const mcSmall = { ...DEFAULT_MC, runs: 25, days: 5 };

describe("weather Monte Carlo", () => {
  it("is reproducible from its seed", () => {
    const a = runMonteCarlo(DEFAULT_INPUTS, mcSmall);
    const b = runMonteCarlo(DEFAULT_INPUTS, mcSmall);
    expect(a.runs).toEqual(b.runs);
  });

  it("gives a different draw for a different seed", () => {
    const a = runMonteCarlo(DEFAULT_INPUTS, mcSmall);
    const b = runMonteCarlo(DEFAULT_INPUTS, { ...mcSmall, seed: 999 });
    expect(a.runs).not.toEqual(b.runs);
  });

  it("returns exactly the requested number of runs", () => {
    const r = runMonteCarlo(DEFAULT_INPUTS, { ...mcSmall, runs: 12 });
    expect(r.runs).toHaveLength(12);
  });

  it("reports the unmet risk as the share of runs that actually had one", () => {
    const r = runMonteCarlo(DEFAULT_INPUTS, mcSmall, { gridLimitMW: 0 });
    const withUnmet = r.runs.filter((x) => x.unmetHours > 0).length;
    expect(r.unmetRiskPct).toBeCloseTo(withUnmet / r.runs.length, 12);
    expect(r.unmetRiskPct).toBeGreaterThanOrEqual(0);
    expect(r.unmetRiskPct).toBeLessThanOrEqual(1);
  });

  it("keeps the lights on islanded, because critical load is the small part", () => {
    // Worth pinning as a result, not an assumption. The plan islands for a
    // fortnight of random weather without dropping a single critical hour:
    // lifestyle is 7.5 of ~41 GWh/day, and the missions curtail first. An
    // "improvement" that let blackouts appear here would be a regression in
    // the dispatch order, not bad luck with the seed.
    const islanded = runMonteCarlo(DEFAULT_INPUTS, mcSmall, { gridLimitMW: 0 });
    expect(islanded.unmetRiskPct).toBe(0);
    expect(islanded.percentiles.importGWh.p50).toBe(0);
    // The battery does get worked down to its floor, so this isn't slack.
    expect(islanded.percentiles.lowestSoC.p50).toBeCloseTo(
      DEFAULT_INPUTS.batteryDoDFloor,
      2,
    );
  });

  it("finds blackouts islanded that the grid would have covered", () => {
    // Starve it of supply and the two modes have to part company: unlimited
    // grid means nothing to go short of, islanded means the shortfall is real.
    const starved = {
      ...DEFAULT_INPUTS,
      solarMW: 300,
      windMW: 100,
      biomassMW: 5,
      hydroMW: 2,
      batteryGWh: 0.5,
    };
    const islanded = runMonteCarlo(starved, mcSmall, { gridLimitMW: 0 });
    const backed = runMonteCarlo(starved, mcSmall);
    expect(islanded.unmetRiskPct).toBe(1);
    expect(islanded.percentiles.unmetHours.p50).toBeGreaterThan(0);
    expect(islanded.percentiles.importGWh.p50).toBe(0);
    expect(backed.unmetRiskPct).toBe(0);
    expect(backed.percentiles.importGWh.p50).toBeGreaterThan(0);
  });

  it("respects season weights — all-monsoon draws differ from all-summer", () => {
    const only = (s: "summer" | "monsoon") => ({
      ...mcSmall,
      weights: {
        summer: s === "summer" ? 1 : 0,
        rainy: 0,
        winter: 0,
        monsoon: s === "monsoon" ? 1 : 0,
      },
    });
    const summer = runMonteCarlo(DEFAULT_INPUTS, only("summer"));
    const monsoon = runMonteCarlo(DEFAULT_INPUTS, only("monsoon"));
    // Monsoon is the worst solar season by a wide margin: summer covers itself
    // and imports nothing, monsoon has to buy. If the weights were ignored the
    // two would be identical.
    expect(summer.percentiles.importGWh.p50).toBe(0);
    expect(monsoon.percentiles.importGWh.p50).toBeGreaterThan(0);
    expect(monsoon.percentiles.lowestSoC.p50).toBeLessThan(
      summer.percentiles.lowestSoC.p50,
    );
  });

  it("normalises weights, so doubling them all changes nothing", () => {
    const base = runMonteCarlo(DEFAULT_INPUTS, mcSmall);
    const doubled = runMonteCarlo(DEFAULT_INPUTS, {
      ...mcSmall,
      weights: {
        summer: mcSmall.weights.summer * 2,
        rainy: mcSmall.weights.rainy * 2,
        winter: mcSmall.weights.winter * 2,
        monsoon: mcSmall.weights.monsoon * 2,
      },
    });
    expect(doubled.runs).toEqual(base.runs);
  });

  it("keeps every run's state of charge inside 0..1", () => {
    const r = runMonteCarlo(DEFAULT_INPUTS, mcSmall, { gridLimitMW: 0 });
    for (const run of r.runs) {
      expect(run.lowestSoC).toBeGreaterThanOrEqual(0);
      expect(run.lowestSoC).toBeLessThanOrEqual(1);
      expect(Number.isFinite(run.importGWh)).toBe(true);
      expect(run.unmetHours).toBeGreaterThanOrEqual(0);
    }
  });

  it("orders its percentile bands", () => {
    const r = runMonteCarlo(DEFAULT_INPUTS, mcSmall, { gridLimitMW: 0 });
    for (const p of Object.values(r.percentiles)) {
      expect(p.p5).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p95);
    }
  });
});
