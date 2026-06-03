import type { SimInputs } from "@/data/types";
import { computeKPIs, simulateDay } from "@/engine/simulate";

export const START_YEAR = 2026;
export const END_YEAR = 2046;

/** Where Phetchaburi roughly is today (2026) — the ramp starts here. */
const BASE_2026: Partial<SimInputs> = {
  solarMW: 150,
  windMW: 100,
  biomassMW: 20,
  hydroMW: 19,
  batteryGWh: 0.5,
  lifestyleGWhPerDay: 4.5,
  dacTargetMtPerYear: 0,
  methanolKtPerYear: 0,
  dataCenterMW: 0,
  desalMm3PerYear: 0,
  wasteTonPerDay: 600,
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
/** S-curve 0..1 over t∈[0,1]. */
function sramp(t: number, k = 6, mid = 0.5) {
  const x = 1 / (1 + Math.exp(-k * (t - mid)));
  const lo = 1 / (1 + Math.exp(-k * (0 - mid)));
  const hi = 1 / (1 + Math.exp(-k * (1 - mid)));
  return (x - lo) / (hi - lo);
}

/**
 * Interpolate the inputs for a given year between the 2026 baseline and the
 * user's 2046 plan. Generation/battery follow an S-shaped build-out; the heavy
 * missions (DAC/methanol/DC/desal) come online later (mid ≈ 0.65).
 */
export function inputsForYear(plan: SimInputs, year: number): SimInputs {
  const t = Math.max(0, Math.min(1, (year - START_YEAR) / (END_YEAR - START_YEAR)));
  const infra = sramp(t, 6, 0.5); // solar/wind/battery
  const mission = sramp(t, 7, 0.65); // missions come online later
  const base = BASE_2026;

  return {
    ...plan,
    solarMW: lerp(base.solarMW!, plan.solarMW, infra),
    windMW: lerp(base.windMW!, plan.windMW, infra),
    biomassMW: lerp(base.biomassMW!, plan.biomassMW, infra),
    hydroMW: lerp(base.hydroMW!, plan.hydroMW, infra),
    batteryGWh: lerp(base.batteryGWh!, plan.batteryGWh, infra),
    lifestyleGWhPerDay: lerp(base.lifestyleGWhPerDay!, plan.lifestyleGWhPerDay, sramp(t, 5, 0.5)),
    dacTargetMtPerYear: lerp(base.dacTargetMtPerYear!, plan.dacTargetMtPerYear, mission),
    methanolKtPerYear: lerp(base.methanolKtPerYear!, plan.methanolKtPerYear, mission),
    dataCenterMW: lerp(base.dataCenterMW!, plan.dataCenterMW, mission),
    desalMm3PerYear: lerp(base.desalMm3PerYear!, plan.desalMm3PerYear, mission),
    wasteTonPerDay: lerp(base.wasteTonPerDay!, plan.wasteTonPerDay, infra),
  };
}

export interface TimePoint {
  year: number;
  capacityMW: number;
  demandGWhYear: number;
  surplusGWhDay: number;
  netCarbonKt: number;
  annualValueB: number;
}

/** Run the model at each year of the build-out. */
export function timeline(plan: SimInputs): TimePoint[] {
  const out: TimePoint[] = [];
  for (let y = START_YEAR; y <= END_YEAR; y++) {
    const inp = inputsForYear(plan, y);
    const k = computeKPIs(inp, simulateDay(inp));
    out.push({
      year: y,
      capacityMW: inp.solarMW + inp.windMW + inp.biomassMW + inp.hydroMW,
      demandGWhYear: k.yearlyDemandGWh,
      surplusGWhDay: k.dailySurplusGWh,
      netCarbonKt: k.netCarbonTon / 1000,
      annualValueB: k.totalAnnualValue / 1e9,
    });
  }
  return out;
}
