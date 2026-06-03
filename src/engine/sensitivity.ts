import type { KPIs, SimInputs } from "@/data/types";
import { computeKPIs, simulateDay } from "@/engine/simulate";

/** Which scalar inputs the tornado sweeps, and their display labels. */
const SWEEP_VARS: { key: keyof SimInputs; label: string }[] = [
  { key: "solarMW", label: "Solar capacity" },
  { key: "windMW", label: "Wind capacity" },
  { key: "biomassMW", label: "Biomass capacity" },
  { key: "batteryGWh", label: "Battery size" },
  { key: "batteryPricePerKWh", label: "Battery price" },
  { key: "carbonPrice", label: "Carbon price" },
  { key: "methanolPrice", label: "Methanol price" },
  { key: "methanolKtPerYear", label: "Methanol output" },
  { key: "dacTargetMtPerYear", label: "DAC target" },
  { key: "dataCenterMW", label: "Data Center size" },
  { key: "gridBuyPrice", label: "Grid buy price" },
  { key: "fuelPrice", label: "Fuel price" },
];

export type SensMetric = "payback" | "annualValue" | "netCarbon";

export const METRIC_META: Record<
  SensMetric,
  { label: string; unit: string; get: (k: KPIs) => number; lowerIsBetter: boolean }
> = {
  payback: {
    label: "Payback (yr)",
    unit: " ปี",
    get: (k) => k.paybackYears,
    lowerIsBetter: true,
  },
  annualValue: {
    label: "Annual value (฿B)",
    unit: "B",
    get: (k) => k.totalAnnualValue / 1e9,
    lowerIsBetter: false,
  },
  netCarbon: {
    label: "Net carbon (kt)",
    unit: "kt",
    get: (k) => k.netCarbonTon / 1e3,
    lowerIsBetter: true,
  },
};

export interface TornadoRow {
  key: keyof SimInputs;
  label: string;
  base: number;
  low: number; // metric when input is at (1-pct)
  high: number; // metric when input is at (1+pct)
  swing: number; // |high - low| — sort key
}

/**
 * One-at-a-time sensitivity: hold everything at baseline, sweep each input by
 * ±`pct`, and record the resulting metric. Returns rows sorted by swing
 * (largest impact first) — i.e. a tornado chart.
 */
export function computeSensitivity(
  inputs: SimInputs,
  metric: SensMetric,
  pct = 0.2,
): { base: number; rows: TornadoRow[] } {
  const m = METRIC_META[metric].get;
  const base = m(computeKPIs(inputs, simulateDay(inputs)));

  const evalAt = (key: keyof SimInputs, factor: number) => {
    const v = inputs[key];
    if (typeof v !== "number") return base;
    const next = { ...inputs, [key]: v * factor };
    return m(computeKPIs(next, simulateDay(next)));
  };

  const rows: TornadoRow[] = SWEEP_VARS.filter(
    (sv) => typeof inputs[sv.key] === "number" && (inputs[sv.key] as number) !== 0,
  ).map((sv) => {
    const low = evalAt(sv.key, 1 - pct);
    const high = evalAt(sv.key, 1 + pct);
    return {
      key: sv.key,
      label: sv.label,
      base,
      low,
      high,
      swing: Math.abs(high - low),
    };
  });

  rows.sort((a, b) => b.swing - a.swing);
  return { base, rows };
}
