import type { SimInputs } from "@/data/types";
import { computeDemandSizes } from "@/engine/simulate";
import { DISTRICT_GEO } from "@/data/districtGeo";
import { AMPHOE_PROTECTED } from "@/data/geo/protected";

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

/** Real area in km², from the OSM boundary (see districtGeo.ts). */
const KM2: Record<string, number> = Object.fromEntries(
  DISTRICT_GEO.map((g) => [g.id, g.km2]),
);

/**
 * The ids here and in the generated geometry have to agree. They're written in
 * two different places — this file by hand, districtGeo.ts by a script keyed
 * off OSM's English names — so a rename upstream would drift them apart. The
 * quiet failure is the bad one: a district with no geometry draws nothing and
 * reports 0 km², which makes its MW/km² zero and its shape simply absent from
 * the map. Better to refuse to start.
 */
const missing = DISTRICTS.filter((d) => !(d.id in KM2)).map((d) => d.id);
if (missing.length > 0) {
  throw new Error(
    `districts.ts: no geometry for ${missing.join(", ")} — re-run npm run build:geo`,
  );
}

export function districtKm2(id: string): number {
  return KM2[id] ?? 0;
}

/**
 * How much of each district is inside a national park or wildlife sanctuary.
 *
 * Joined on the English name, because the two pipelines were built years apart
 * and share no id: districtGeo.ts keys on a hand-written slug, the nationwide
 * build keys on OSM's relation id. Both take their English name from the same
 * OSM tag, so the name is the one thing they genuinely have in common — with
 * one exception, since the older file calls the capital district "Mueang" and
 * OSM calls it "Mueang Phetchaburi".
 *
 * An incomplete join throws. A district silently defaulting to 0% protected
 * would report all of its land as buildable, which is the exact error this
 * data exists to prevent.
 */
const PROTECTED_FRAC: Record<string, number> = (() => {
  const byEn = new Map(
    AMPHOE_PROTECTED.filter((a) => a.iso === "TH-76").map((a) => [
      a.en,
      a.protectedFrac,
    ]),
  );
  const alias: Record<string, string> = { Mueang: "Mueang Phetchaburi" };
  const out: Record<string, number> = {};
  const unmatched: string[] = [];
  for (const d of DISTRICTS) {
    const frac = byEn.get(alias[d.en] ?? d.en);
    if (frac == null) unmatched.push(`${d.id} (${d.en})`);
    else out[d.id] = frac;
  }
  if (unmatched.length > 0) {
    throw new Error(
      `districts.ts: no protected-area figure for ${unmatched.join(", ")} — ` +
        `re-run npm run fetch:parks, or the English names have drifted`,
    );
  }
  return out;
})();

/** Land not inside a protected area, km². */
export function buildableKm2(id: string): number {
  return districtKm2(id) * (1 - (PROTECTED_FRAC[id] ?? 0));
}

/**
 * Land a ground-mounted solar farm occupies, km² per MW.
 *
 * 7 rai/MW, which is the figure from real Thai project costing rather than a
 * textbook one; 1 rai is 1,600 m².
 */
const KM2_PER_SOLAR_MW = (7 * 1600) / 1e6;

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
  /** Real district area, so the map can show intensity as well as totals. */
  km2: number;
  /** Area outside any national park or sanctuary. */
  buildableKm2: number;
  /**
   * Share of that buildable land this district's solar would cover.
   *
   * Worth showing because the intuition it tests turns out to be wrong.
   * Kaeng Krachan is 77% national park and takes 820 MW of solar, which sounds
   * like a contradiction until it is measured: 820 MW is 9.2 km² at 7 rai/MW,
   * against 603 km² of unprotected land — 1.5% of it. Across the province the
   * whole 8.2 GW needs 92 km² of 3,365. Land is not what limits this plan, and
   * a number that says so is more useful than a warning that never fires.
   */
  solarLandPct: number;
  /** Installed generation per km² — a very different picture from the total,
   *  because Kaeng Krachan and Nong Ya Plong are 62% of the province between
   *  them and would otherwise look busiest simply for being biggest. */
  capacityMWPerKm2: number;
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
    const km2 = districtKm2(district.id);
    const free = buildableKm2(district.id);
    return {
      d: district,
      solarMW,
      windMW,
      hydroMW,
      batteryGWh,
      missionGWhDay,
      genGWhDay,
      capacityMW,
      km2,
      capacityMWPerKm2: km2 > 0 ? capacityMW / km2 : 0,
      buildableKm2: free,
      solarLandPct: free > 0 ? (solarMW * KM2_PER_SOLAR_MW) / free : 0,
    };
  });
}
