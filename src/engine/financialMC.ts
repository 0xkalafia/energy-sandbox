import type { SimInputs } from "@/data/types";
import { computeKPIs, simulateDay } from "@/engine/simulate";
import {
  projectMultiYear,
  DEFAULT_MULTI_YEAR,
  type MultiYearOptions,
} from "@/engine/multiYear";

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

// Mulberry32 + Box–Muller
function makeRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + sd * z;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function pctl(vals: number[]): Pctl {
  const s = [...vals].sort((a, b) => a - b);
  return {
    p10: percentile(s, 0.1),
    p50: percentile(s, 0.5),
    p90: percentile(s, 0.9),
    mean: vals.reduce((a, b) => a + b, 0) / vals.length,
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
      carbonPrice: pos(gauss(rng, inputs.carbonPrice, inputs.carbonPrice * opts.sd.carbonPrice)),
      batteryPricePerKWh: pos(
        gauss(rng, inputs.batteryPricePerKWh, inputs.batteryPricePerKWh * opts.sd.batteryPrice),
      ),
      methanolPrice: pos(gauss(rng, inputs.methanolPrice, inputs.methanolPrice * opts.sd.methanolPrice)),
      gridBuyPrice: pos(gauss(rng, inputs.gridBuyPrice, inputs.gridBuyPrice * opts.sd.gridBuyPrice)),
      lifestyleGWhPerDay: pos(
        gauss(rng, inputs.lifestyleGWhPerDay, inputs.lifestyleGWhPerDay * opts.sd.demand),
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

export function histogram(
  values: number[],
  bins: number,
  range?: [number, number],
): Array<{ lo: number; hi: number; count: number }> {
  if (values.length === 0) return [];
  const min = range ? range[0] : Math.min(...values);
  const max = range ? range[1] : Math.max(...values);
  if (min === max) return [{ lo: min, hi: max, count: values.length }];
  const w = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / w);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  }
  return counts.map((count, i) => ({
    lo: min + i * w,
    hi: min + (i + 1) * w,
    count,
  }));
}
