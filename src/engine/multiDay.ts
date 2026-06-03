import type { HourlyPoint, SimInputs, Season } from "@/data/types";
import { simulateDay } from "./simulate";

export type WeatherScenario = "current" | "monsoonStreak" | "elNino" | "mixedWeek";

export const WEATHER_SCENARIOS: {
  id: WeatherScenario;
  label: string;
  description: string;
}[] = [
  {
    id: "current",
    label: "ฤดูปัจจุบัน",
    description: "ทุกวันใช้ฤดูที่เลือกใน sidebar",
  },
  {
    id: "monsoonStreak",
    label: "มรสุมแช่ 5 วัน",
    description: "วันที่ 2-6 ฟ้าปิด/ลมไม่แรง — ทดสอบ battery resilience",
  },
  {
    id: "elNino",
    label: "เอลนีโญ",
    description: "ร้อนจัดทั้งสัปดาห์ ลมนิ่ง น้ำในเขื่อนน้อย",
  },
  {
    id: "mixedWeek",
    label: "สัปดาห์สลับฤดู",
    description: "ลำดับฤดูร้อน-ฝน-หนาว-มรสุม สลับกัน",
  },
];

/** Derive a per-day season sequence from a high-level weather scenario. */
function buildSeasonSequence(
  scenario: WeatherScenario,
  baseSeason: Season,
  days: number,
): Season[] {
  switch (scenario) {
    case "monsoonStreak":
      // day 0,1 = base; day 2..6 = monsoon; day 7+ = base
      return Array.from({ length: days }, (_, d) =>
        d >= 2 && d <= 6 ? "monsoon" : baseSeason,
      );
    case "elNino":
      return Array(days).fill("summer") as Season[];
    case "mixedWeek":
      return Array.from(
        { length: days },
        (_, d) => (["summer", "rainy", "winter", "monsoon"] as Season[])[d % 4],
      );
    default:
      return Array(days).fill(baseSeason);
  }
}

export interface MultiDayPoint extends HourlyPoint {
  /** absolute hour in the multi-day window (0..days*24-1) */
  globalHour: number;
  /** which day this hour belongs to (0..days-1) */
  day: number;
  /** which season was used to drive this day */
  daySeason: Season;
}

export interface DaySummary {
  day: number;
  season: Season;
  supplyGWh: number;
  demandGWh: number;
  importGWh: number;
  exportGWh: number;
  minSoC: number;
  endSoC: number;
}

export interface MultiDayResult {
  hourly: MultiDayPoint[];
  daily: DaySummary[];
  scenario: WeatherScenario;
  lowestSoC: number;
  unmetHours: number; // hours where CRITICAL load was shed (true blackout)
  curtailedHours: number; // hours where a FLEXIBLE mission was curtailed
  unmetGWh: number; // total critical energy not served
  curtailedGWh: number; // total flexible energy curtailed
  importTotalGWh: number;
}

export interface MultiDayOpts {
  /** Islanded stress test: cap grid import per hour (MW). Default Infinity
   *  (grid-backed). 0 = fully islanded. */
  gridLimitMW?: number;
  /** Battery SoC fraction at the very start of day 0 (0..1). Default 0.5. */
  startSoC?: number;
}

/**
 * Run the engine for `days` consecutive 24-hour windows, **truly carrying**
 * battery state of charge across day boundaries: day N starts exactly where
 * day N-1 ended (no visual stitching — the dispatch sees the real SoC). This
 * is what lets a multi-day monsoon streak genuinely deplete the battery and
 * surface unmet (blackout) hours.
 */
export function simulateMultiDay(
  inputs: SimInputs,
  days: number,
  scenario: WeatherScenario,
  opts: MultiDayOpts = {},
): MultiDayResult {
  const seasonSeq = buildSeasonSequence(scenario, inputs.season, days);
  const gridLimitMW = opts.gridLimitMW ?? Infinity;

  const allHours: MultiDayPoint[] = [];
  const daily: DaySummary[] = [];

  let carrySoC = clamp(opts.startSoC ?? 0.5, 0, 1); // real SoC handed day→day
  let cumulativeMinSoC = 1;
  let unmetHours = 0;
  let curtailedHours = 0;
  let unmetGWh = 0;
  let curtailedGWh = 0;
  let cumulativeImport = 0;

  for (let d = 0; d < days; d++) {
    const daySeason = seasonSeq[d];
    const dayInputs = { ...inputs, season: daySeason };
    // Chain: this day starts at the previous day's ending SoC.
    const dayHourly = simulateDay(dayInputs, {
      startSoC: carrySoC,
      gridLimitMW,
    });

    let supplyGWh = 0;
    let demandGWh = 0;
    let importGWh = 0;
    let exportGWh = 0;
    let minSoC = 1;

    for (let h = 0; h < 24; h++) {
      const point = dayHourly[h];

      allHours.push({
        ...point,
        globalHour: d * 24 + h,
        day: d,
        daySeason,
      });

      supplyGWh += point.totalSupply / 1000;
      demandGWh += point.totalDemand / 1000;
      importGWh += point.gridImport / 1000;
      exportGWh += point.gridExport / 1000;
      if (point.batterySoC < minSoC) minSoC = point.batterySoC;
      if (point.unmet > 1e-6) {
        unmetHours += 1;
        unmetGWh += point.unmet / 1000;
      }
      if (point.curtailed > 1e-6) {
        curtailedHours += 1;
        curtailedGWh += point.curtailed / 1000;
      }
    }

    // Hand the true ending SoC to the next day.
    carrySoC = dayHourly[dayHourly.length - 1].batterySoC;

    cumulativeImport += importGWh;
    if (minSoC < cumulativeMinSoC) cumulativeMinSoC = minSoC;

    daily.push({
      day: d,
      season: daySeason,
      supplyGWh,
      demandGWh,
      importGWh,
      exportGWh,
      minSoC,
      endSoC: carrySoC,
    });
  }

  return {
    hourly: allHours,
    daily,
    scenario,
    lowestSoC: cumulativeMinSoC,
    unmetHours,
    curtailedHours,
    unmetGWh,
    curtailedGWh,
    importTotalGWh: cumulativeImport,
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
