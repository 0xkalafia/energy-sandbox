import type { SimInputs, Season } from "@/data/types";
import { simulateMultiDay, type WeatherScenario } from "./multiDay";

export interface MonteCarloOptions {
  /** Number of weather realizations to run */
  runs: number;
  /** Days per realization */
  days: number;
  /** Seed (so user can reproduce) */
  seed: number;
  /** Season weights — how often each season appears in random draws */
  weights: { summer: number; rainy: number; winter: number; monsoon: number };
}

export const DEFAULT_MC: MonteCarloOptions = {
  runs: 100,
  days: 14,
  seed: 42,
  weights: { summer: 0.3, rainy: 0.25, winter: 0.25, monsoon: 0.2 },
};

export interface MonteCarloResult {
  /** Per-run summary statistics */
  runs: Array<{
    lowestSoC: number;
    unmetHours: number;
    importGWh: number;
  }>;
  /** Aggregate percentiles */
  percentiles: {
    lowestSoC: Percentiles;
    unmetHours: Percentiles;
    importGWh: Percentiles;
  };
  /** % of runs where any unmet hour occurred */
  unmetRiskPct: number;
}

interface Percentiles {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  mean: number;
}

// Mulberry32 PRNG — small, fast, seedable
function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(
  rng: () => number,
  weights: MonteCarloOptions["weights"],
): Season {
  const r = rng();
  const total = weights.summer + weights.rainy + weights.winter + weights.monsoon;
  let cum = 0;
  cum += weights.summer / total;
  if (r < cum) return "summer";
  cum += weights.rainy / total;
  if (r < cum) return "rainy";
  cum += weights.winter / total;
  if (r < cum) return "winter";
  return "monsoon";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computePercentiles(values: number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: percentile(sorted, 0.05),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

/**
 * For a given inputs/season distribution, sample N weather realizations
 * and run the multi-day engine for each. Returns per-run summary +
 * percentile bands over all runs.
 *
 * For each realization we generate a sequence of seasons (one per day)
 * using the user's weights. We then encode it as the "current" weather
 * scenario by overriding `inputs.season` once per pick — since
 * simulateMultiDay applies a single season override per day chain, we
 * approximate by averaging chunks of consecutive same-season days.
 *
 * For MVP we use the simpler trick: feed a randomly-sampled `inputs.season`
 * to each run, treating the run as "season X dominant" — this gives a
 * realistic distribution across season mixes.
 */
export function runMonteCarlo(
  inputs: SimInputs,
  opts: MonteCarloOptions,
): MonteCarloResult {
  const rng = makeRng(opts.seed);
  const runs: MonteCarloResult["runs"] = [];

  for (let i = 0; i < opts.runs; i++) {
    // Pick a dominant season for this run (most-frequent)
    const season = weightedPick(rng, opts.weights);
    // Pick a scenario: 50% current, 25% mixed week, 15% monsoon, 10% elnino
    const r = rng();
    const scenario: WeatherScenario =
      r < 0.5 ? "current" : r < 0.75 ? "mixedWeek" : r < 0.9 ? "monsoonStreak" : "elNino";

    const result = simulateMultiDay(
      { ...inputs, season },
      opts.days,
      scenario,
    );

    runs.push({
      lowestSoC: result.lowestSoC,
      unmetHours: result.unmetHours,
      importGWh: result.importTotalGWh,
    });
  }

  return {
    runs,
    percentiles: {
      lowestSoC: computePercentiles(runs.map((r) => r.lowestSoC)),
      unmetHours: computePercentiles(runs.map((r) => r.unmetHours)),
      importGWh: computePercentiles(runs.map((r) => r.importGWh)),
    },
    unmetRiskPct: runs.filter((r) => r.unmetHours > 0).length / runs.length,
  };
}

/**
 * Bucket a continuous variable into a histogram for chart rendering.
 */
export function histogram(
  values: number[],
  bins: number,
  range?: [number, number],
): Array<{ bin: number; count: number; lo: number; hi: number }> {
  if (values.length === 0) return [];
  const min = range ? range[0] : Math.min(...values);
  const max = range ? range[1] : Math.max(...values);
  if (min === max) return [{ bin: 0, count: values.length, lo: min, hi: max }];
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx === bins) idx = bins - 1;
    if (idx >= 0 && idx < bins) counts[idx] += 1;
  }
  return counts.map((count, i) => ({
    bin: i,
    count,
    lo: min + i * width,
    hi: min + (i + 1) * width,
  }));
}
