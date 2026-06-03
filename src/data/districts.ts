import type { SimInputs } from "@/data/types";
import { computeDemandSizes } from "@/engine/simulate";

/**
 * The 8 amphoe of Phetchaburi, laid out schematically (NOT to scale).
 * x: 0 = west (mountains) → 100 = east (Gulf coast)
 * y: 0 = north → 100 = south
 * Positions are geography-informed: the dam sits SW, the coast E/SE.
 */
export interface District {
  id: string;
  name: string; // Thai
  en: string;
  x: number;
  y: number;
  coastal: boolean;
  /** Allocation weights (normalised within each resource across districts). */
  w: {
    solar: number;
    wind: number;
    hydro: number; // basically only Kaeng Krachan
    battery: number;
    dac: number;
    dataCenter: number;
    desal: number;
    methanol: number;
    waste: number;
  };
  /** Headline role shown on the card. */
  role: string;
}

export const DISTRICTS: District[] = [
  {
    id: "khaoyoi", name: "เขาย้อย", en: "Khao Yoi", x: 56, y: 12, coastal: false,
    w: { solar: 0.15, wind: 0.2, hydro: 0, battery: 0.2, dac: 0.6, dataCenter: 0.7, desal: 0, methanol: 0.5, waste: 0.1 },
    role: "Industry · DAC · Data Center",
  },
  {
    id: "banlaem", name: "บ้านแหลม", en: "Ban Laem", x: 84, y: 22, coastal: true,
    w: { solar: 0.08, wind: 0.15, hydro: 0, battery: 0.08, dac: 0, dataCenter: 0, desal: 0.5, methanol: 0.2, waste: 0.1 },
    role: "Coast · Desalination · Salt",
  },
  {
    id: "nongyaplong", name: "หนองหญ้าปล้อง", en: "Nong Ya Plong", x: 20, y: 30, coastal: false,
    w: { solar: 0.1, wind: 0.1, hydro: 0, battery: 0.05, dac: 0, dataCenter: 0, desal: 0, methanol: 0, waste: 0.05 },
    role: "Hills · Solar",
  },
  {
    id: "mueang", name: "เมือง", en: "Mueang", x: 70, y: 40, coastal: true,
    w: { solar: 0.1, wind: 0.05, hydro: 0, battery: 0.22, dac: 0.1, dataCenter: 0.2, desal: 0.3, methanol: 0.1, waste: 0.35 },
    role: "Capital · Load hub · Battery",
  },
  {
    id: "banlat", name: "บ้านลาด", en: "Ban Lat", x: 46, y: 51, coastal: false,
    w: { solar: 0.17, wind: 0.05, hydro: 0, battery: 0.08, dac: 0.1, dataCenter: 0, desal: 0, methanol: 0.05, waste: 0.05 },
    role: "Agrivoltaics",
  },
  {
    id: "thayang", name: "ท่ายาง", en: "Tha Yang", x: 56, y: 66, coastal: false,
    w: { solar: 0.2, wind: 0.05, hydro: 0, battery: 0.1, dac: 0.1, dataCenter: 0, desal: 0, methanol: 0.05, waste: 0.1 },
    role: "Agrivoltaics · Substation",
  },
  {
    id: "kaengkrachan", name: "แก่งกระจาน", en: "Kaeng Krachan", x: 18, y: 72, coastal: false,
    w: { solar: 0.1, wind: 0.2, hydro: 1.0, battery: 0.07, dac: 0, dataCenter: 0, desal: 0, methanol: 0, waste: 0.05 },
    role: "Dam · Hydro · Floating solar · Wind",
  },
  {
    id: "chaam", name: "ชะอำ", en: "Cha-am", x: 74, y: 87, coastal: true,
    w: { solar: 0.1, wind: 0.2, hydro: 0, battery: 0.12, dac: 0, dataCenter: 0, desal: 0.2, methanol: 0, waste: 0.15 },
    role: "Tourism · Wind · EV hub",
  },
];

export interface DistrictAlloc {
  d: District;
  solarMW: number;
  windMW: number;
  hydroMW: number;
  batteryGWh: number;
  // mission GWh/day hosted (sum of dac/dc/desal/methanol/waste shares)
  missionGWhDay: number;
  genGWhDay: number; // rough daily generation hosted here
  capacityMW: number; // total installed generation
}

/** Sum a weight key across all districts (for normalisation). */
function wSum(key: keyof District["w"]): number {
  return DISTRICTS.reduce((s, d) => s + d.w[key], 0) || 1;
}

const NORM = {
  solar: wSum("solar"),
  wind: wSum("wind"),
  hydro: wSum("hydro"),
  battery: wSum("battery"),
  dac: wSum("dac"),
  dataCenter: wSum("dataCenter"),
  desal: wSum("desal"),
  methanol: wSum("methanol"),
  waste: wSum("waste"),
};

/** Spread the province totals across the 8 districts using normalised weights
 *  so the per-district figures sum back to the province total exactly. */
export function allocate(inputs: SimInputs): DistrictAlloc[] {
  const d = computeDemandSizes(inputs);
  return DISTRICTS.map((district) => {
    const w = district.w;
    const solarMW = inputs.solarMW * (w.solar / NORM.solar);
    const windMW = inputs.windMW * (w.wind / NORM.wind);
    const hydroMW = inputs.hydroMW * (w.hydro / NORM.hydro);
    const batteryGWh = inputs.batteryGWh * (w.battery / NORM.battery);
    const missionGWhDay =
      d.dac * (w.dac / NORM.dac) +
      d.dataCenter * (w.dataCenter / NORM.dataCenter) +
      d.desal * (w.desal / NORM.desal) +
      d.methanol * (w.methanol / NORM.methanol) +
      d.waste * (w.waste / NORM.waste);
    // crude daily gen estimate at ~0.17 CF blended
    const capacityMW = solarMW + windMW + hydroMW;
    const genGWhDay = (capacityMW * 24 * 0.17) / 1000;
    return {
      d: district,
      solarMW,
      windMW,
      hydroMW,
      batteryGWh,
      missionGWhDay,
      genGWhDay,
      capacityMW,
    };
  });
}
