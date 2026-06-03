import type { SimInputs } from "@/data/types";
import { computeKPIs, simulateDay } from "@/engine/simulate";
import {
  projectMultiYear,
  DEFAULT_MULTI_YEAR,
  type MultiYearOptions,
} from "@/engine/multiYear";
import { makeRng, gaussian, percentileSorted } from "@/lib/stats";

// Re-export so existing chart imports keep resolving.
export { histogram } from "@/lib/stats";

export interface FinMCOptions {
  samples: number;
  seed: number;
  horizon: number; // years
  /** Relative 1σ uncertainty (fraction) per uncertain driver. */
  sd: {
    carbonPrice: number;
    batteryPrice: number;
    methanolPrice: number;
    gridBuyPrice: number;
    demand: number; // scales lifestyle load
  };
}

export const DEFAULT_FIN_MC: FinMCOptions = {
  samples: 400,
  seed: 7,
  horizon: 20,
  sd: {
    carbonPrice: 0.35,
    batteryPrice: 0.2,
    methanolPrice: 0.25,
    gridBuyPrice: 0.15,
    demand: 0.1,
  },
};

interface Pctl {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

export interface FinMCResult {
  paybackYears: number[]; // horizon+1 means "never within horizon"
  lifetimeNet: number[]; // ฿
  payback: Pctl;
  lifetimeNetB: Pctl; // in ฿B
  probPaysBack: number; // 0..1 within horizon
  probNetPositive: number; // 0..1 lifetime net > 0
  horizon: number;
}

function pctl(vals: number[]): Pctl {
  const s = [...vals].sort((a, b) => a - b);
  return {
    p10: percentileSorted(s, 0.1),
    p50: percentileSorted(s, 0.5),
    p90: percentileSorted(s, 0.9),
    mean: vals.reduce((a, b) => a + b, 0) / (vals.length || 1),
  };
}

/**
 * Monte Carlo over the *financial* drivers: sample carbon/battery/methanol/grid
 * prices and demand from log-normalish Normals, run the full KPI + 20-year
 * projection per sample, and return the distribution of payback and lifetime
 * net. Answers "given my price uncertainty, how likely is this to pay back?".
 */
export function runFinancialMC(
  inputs: SimInputs,
  opts: FinMCOptions,
  yearOpts: MultiYearOptions = DEFAULT_MULTI_YEAR,
): FinMCResult {
  const rng = makeRng(opts.seed);
  const paybackYears: number[] = [];
  const lifetimeNet: number[] = [];
  const yo = { ...yearOpts, years: opts.horizon };

  const pos = (x: number) => Math.max(0, x);

  for (let i = 0; i < opts.samples; i++) {
    const sample: SimInputs = {
      ...inputs,
      carbonPrice: pos(gaussian(rng, inputs.carbonPrice, inputs.carbonPrice * opts.sd.carbonPrice)),
      batteryPricePerKWh: pos(
        gaussian(rng, inputs.batteryPricePerKWh, inputs.batteryPricePerKWh * opts.sd.batteryPrice),
      ),
      methanolPrice: pos(gaussian(rng, inputs.methanolPrice, inputs.methanolPrice * opts.sd.methanolPrice)),
      gridBuyPrice: pos(gaussian(rng, inputs.gridBuyPrice, inputs.gridBuyPrice * opts.sd.gridBuyPrice)),
      lifestyleGWhPerDay: pos(
        gaussian(rng, inputs.lifestyleGWhPerDay, inputs.lifestyleGWhPerDay * opts.sd.demand),
      ),
    };

    const kpis = computeKPIs(sample, simulateDay(sample));
    const proj = projectMultiYear(kpis, sample, yo);

    paybackYears.push(proj.paybackYear ?? opts.horizon + 1);
    lifetimeNet.push(proj.totalLifetimeNet);
  }

  const within = paybackYears.filter((y) => y <= opts.horizon).length;
  const netPos = lifetimeNet.filter((n) => n > 0).length;

  return {
    paybackYears,
    lifetimeNet,
    payback: pctl(paybackYears),
    lifetimeNetB: pctl(lifetimeNet.map((n) => n / 1e9)),
    probPaysBack: within / opts.samples,
    probNetPositive: netPos / opts.samples,
    horizon: opts.horizon,
  };
}

