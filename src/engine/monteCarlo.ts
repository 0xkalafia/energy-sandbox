import type { SimInputs, Season } from "@/data/types";
import { simulateMultiDay, type WeatherScenario } from "./multiDay";
import { makeRng, percentiles, type Percentiles } from "@/lib/stats";

// Re-export so existing chart imports (`from "@/engine/monteCarlo"`) keep working.
export { histogram } from "@/lib/stats";

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
  sim: { gridLimitMW?: number } = {},
): MonteCarloResult {
  const rng = makeRng(opts.seed);
  const runs: MonteCarloResult["runs"] = [];
  const gridLimitMW = sim.gridLimitMW ?? Infinity;

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
      { gridLimitMW },
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
      lowestSoC: percentiles(runs.map((r) => r.lowestSoC)),
      unmetHours: percentiles(runs.map((r) => r.unmetHours)),
      importGWh: percentiles(runs.map((r) => r.importGWh)),
    },
    unmetRiskPct: runs.filter((r) => r.unmetHours > 0).length / runs.length,
  };
}
