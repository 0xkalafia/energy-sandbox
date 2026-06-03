import type { Season, SimInputs } from "@/data/types";
import { simulateDay } from "@/engine/simulate";

/** Phetchaburi month → representative season. */
export const MONTH_SEASON: Season[] = [
  "winter", // ม.ค.
  "winter", // ก.พ.
  "summer", // มี.ค.
  "summer", // เม.ย.
  "summer", // พ.ค.
  "rainy", // มิ.ย.
  "rainy", // ก.ค.
  "rainy", // ส.ค.
  "monsoon", // ก.ย.
  "monsoon", // ต.ค.
  "winter", // พ.ย.
  "winter", // ธ.ค.
];

export const MONTH_LABELS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export interface AnnualCell {
  month: number; // 0..11
  hour: number; // 0..23
  net: number; // MW (supply - demand)
  supply: number;
  demand: number;
}

/**
 * A representative 12-month × 24-hour grid: one typical day per month, driven by
 * that month's season. 288 cells — enough for a calendar heatmap and a
 * load-duration curve without simulating all 8760 hours.
 */
export function annualGrid(inputs: SimInputs): AnnualCell[] {
  const cells: AnnualCell[] = [];
  for (let m = 0; m < 12; m++) {
    const day = simulateDay({ ...inputs, season: MONTH_SEASON[m] });
    for (let h = 0; h < 24; h++) {
      cells.push({
        month: m,
        hour: h,
        net: day[h].net,
        supply: day[h].totalSupply,
        demand: day[h].totalDemand,
      });
    }
  }
  return cells;
}

/** Net (supply − demand) sorted descending — the net duration curve. */
export function netDurationCurve(cells: AnnualCell[]): number[] {
  return cells.map((c) => c.net).sort((a, b) => b - a);
}

/** Demand sorted descending — the classic load duration curve. */
export function loadDurationCurve(cells: AnnualCell[]): number[] {
  return cells.map((c) => c.demand).sort((a, b) => b - a);
}
