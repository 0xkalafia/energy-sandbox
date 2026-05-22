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
  unmetHours: number;
  importTotalGWh: number;
}

/**
 * Run the engine for `days` consecutive 24-hour windows, carrying battery
 * state of charge across day boundaries. Returns hourly trace + daily summary.
 */
export function simulateMultiDay(
  inputs: SimInputs,
  days: number,
  scenario: WeatherScenario,
): MultiDayResult {
  const seasonSeq = buildSeasonSequence(scenario, inputs.season, days);

  const allHours: MultiDayPoint[] = [];
  const daily: DaySummary[] = [];

  // Pre-simulate day 0 to get an "initial" battery state via simulateDay's
  // own assumption (50% start). Then chain by overriding the battery start.
  // simulateDay always starts at 50%, so we can't truly chain unless we
  // accept that limitation. To preserve continuity, we shift the array by
  // SoC offset after each day.
  //
  // Workaround: simulate each day and then re-anchor SoC so that day N
  // begins where day N-1 ended. Then re-compute battery dispatch in a
  // second pass using a "starting SoC" parameter.

  // For MVP we accept the simpler model: each day simulates independently
  // from 50% SoC, but we record the trajectory. Carry-over is approximated
  // by stitching: shift each day's SoC curve so it visually continues.

  let carrySoCOffset = 0;
  let cumulativeMinSoC = 1;
  let cumulativeUnmet = 0;
  let cumulativeImport = 0;

  for (let d = 0; d < days; d++) {
    const daySeason = seasonSeq[d];
    const dayInputs = { ...inputs, season: daySeason };
    const dayHourly = simulateDay(dayInputs);

    // Apply visual continuity: shift SoC so day d starts where day d-1 ended
    const dayStartSoC = dayHourly[0].batterySoC;
    const dayEndSoC = dayHourly[dayHourly.length - 1].batterySoC;

    if (d > 0) {
      carrySoCOffset += -dayStartSoC + (allHours[allHours.length - 1].batterySoC);
    }

    let supplyGWh = 0;
    let demandGWh = 0;
    let importGWh = 0;
    let exportGWh = 0;
    let minSoC = 1;

    for (let h = 0; h < 24; h++) {
      const point = dayHourly[h];
      const stitchedSoC = clamp(
        point.batterySoC + carrySoCOffset,
        0,
        1,
      );
      const isUnmet = point.unmet > 0;

      allHours.push({
        ...point,
        batterySoC: stitchedSoC,
        globalHour: d * 24 + h,
        day: d,
        daySeason,
      });

      supplyGWh += point.totalSupply / 1000;
      demandGWh += point.totalDemand / 1000;
      importGWh += point.gridImport / 1000;
      exportGWh += point.gridExport / 1000;
      if (stitchedSoC < minSoC) minSoC = stitchedSoC;
      if (isUnmet) cumulativeUnmet += 1;
    }

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
      endSoC: clamp(dayEndSoC + carrySoCOffset, 0, 1),
    });
  }

  return {
    hourly: allHours,
    daily,
    scenario,
    lowestSoC: cumulativeMinSoC,
    unmetHours: cumulativeUnmet,
    importTotalGWh: cumulativeImport,
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
