import type { SimInputs } from "@/data/types";
import { computeKPIs, simulateDay } from "@/engine/simulate";
import { simulateMultiDay } from "@/engine/multiDay";

export interface OptOptions {
  days: number; // islanded stress length
  solarSteps: number;
  batterySteps: number;
  solarMaxMW: number;
  batteryMaxGWh: number;
}

export const DEFAULT_OPT: OptOptions = {
  days: 7,
  solarSteps: 9,
  batterySteps: 9,
  solarMaxMW: 12000,
  batteryMaxGWh: 40,
};

export interface OptPoint {
  solarMW: number;
  batteryGWh: number;
  capex: number; // ฿
  feasible: boolean; // 0 blackout over the islanded stress
  unmetHours: number;
  lowestSoC: number;
}

export interface OptResult {
  grid: OptPoint[];
  best: OptPoint | null; // min-CAPEX feasible point
  baseline: { solarMW: number; batteryGWh: number; capex: number; feasible: boolean };
  solarValues: number[];
  batteryValues: number[];
}

function range(max: number, steps: number, min: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    out.push(min + ((max - min) * i) / (steps - 1));
  }
  return out;
}

/**
 * Grid-search the two dominant resilience levers — solar capacity and battery
 * size — to find the **minimum-CAPEX** mix that survives an islanded monsoon
 * stretch with zero blackout hours. Everything else is held at the user's
 * current inputs. Returns the full grid (for a heatmap) plus the best point.
 */
export function optimizeResilientMix(
  inputs: SimInputs,
  opts: OptOptions = DEFAULT_OPT,
): OptResult {
  const solarValues = range(opts.solarMaxMW, opts.solarSteps, 1000).map((v) =>
    Math.round(v / 100) * 100,
  );
  const batteryValues = range(opts.batteryMaxGWh, opts.batterySteps, 2).map(
    (v) => Math.round(v * 2) / 2,
  );

  const grid: OptPoint[] = [];
  let best: OptPoint | null = null;

  for (const solarMW of solarValues) {
    for (const batteryGWh of batteryValues) {
      const cand: SimInputs = { ...inputs, solarMW, batteryGWh };
      const r = simulateMultiDay(cand, opts.days, "monsoonStreak", {
        gridLimitMW: 0,
      });
      const capex = computeKPIs(cand, simulateDay(cand)).capexEstimate;
      const point: OptPoint = {
        solarMW,
        batteryGWh,
        capex,
        feasible: r.unmetHours === 0,
        unmetHours: r.unmetHours,
        lowestSoC: r.lowestSoC,
      };
      grid.push(point);
      if (point.feasible && (best === null || point.capex < best.capex)) {
        best = point;
      }
    }
  }

  const baseKpis = computeKPIs(inputs, simulateDay(inputs));
  const baseR = simulateMultiDay(inputs, opts.days, "monsoonStreak", {
    gridLimitMW: 0,
  });

  return {
    grid,
    best,
    baseline: {
      solarMW: inputs.solarMW,
      batteryGWh: inputs.batteryGWh,
      capex: baseKpis.capexEstimate,
      feasible: baseR.unmetHours === 0,
    },
    solarValues,
    batteryValues,
  };
}
