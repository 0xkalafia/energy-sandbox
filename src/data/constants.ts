// ---------- Baseline values from Phetchaburi 2046 simulation ----------
// Source: Gemini chat captured in memory/reference_phetchaburi_energy_sim.md

import type { Season, SimInputs } from "./types";

/** Default inputs = the "Full 2046 Master Plan" from the chat. */
export const DEFAULT_INPUTS: SimInputs = {
  // Supply
  solarMW: 8200,
  windMW: 3400,
  biomassMW: 100,
  hydroMW: 20,

  // Demand modules
  lifestyleGWhPerDay: 7.5,
  dacOn: true,
  dacTargetMtPerYear: 1.0,
  methanolOn: true,
  methanolKtPerYear: 727,
  dataCenterOn: true,
  dataCenterMW: 200,
  desalOn: true,
  desalMm3PerYear: 250,
  wasteOn: true,
  wasteTonPerDay: 1645,
  wwtOn: true,
  wwtCoverage: 1.0,

  // Battery (Sodium-ion 2046 projection)
  batteryGWh: 22.25,
  batteryDoDFloor: 0.1,
  batteryRoundTrip: 0.9,
  batteryPricePerKWh: 525,

  // Pricing (2046 forecast)
  gridBuyPrice: 3.5,
  gridSellPrice: 5.0,
  fuelPrice: 45,
  carbonPrice: 150,
  methanolPrice: 550,

  season: "summer",
};

/** Energy intensity per task — used to size demand from targets. */
export const ENERGY_INTENSITY = {
  /** kWh per ton CO2 captured by DAC */
  dacKWhPerTon: 2500,
  /** kWh per kg of green H2 produced (electrolysis) */
  electrolyzerKWhPerKgH2: 45,
  /** kg H2 needed per ton of E-methanol */
  h2PerMethanolTon: 187,
  /** Synthesis overhead (kWh per ton methanol) */
  methanolSynthesisKWhPerTon: 900,
  /** kWh per m³ desalinated water */
  desalKWhPerM3: 3,
  /** kWh per ton of waste processed (plasma gasification) */
  plasmaKWhPerTon: 1000,
  /** kWh per m³ wastewater treated */
  wwtKWhPerM3: 0.6,
  /** Population × m³/person/day = wastewater */
  populationPhet2046: 600_000,
  wwtLitersPerPersonPerDay: 200,
} as const;

/** Capacity factor per source, per season (annual average for daily total). */
export const CF_BY_SEASON: Record<
  Season,
  { solar: number; wind: number; biomass: number; hydro: number }
> = {
  summer: { solar: 0.22, wind: 0.12, biomass: 0.85, hydro: 0.05 },
  rainy: { solar: 0.13, wind: 0.25, biomass: 0.8, hydro: 0.45 },
  winter: { solar: 0.2, wind: 0.35, biomass: 0.8, hydro: 0.5 },
  monsoon: { solar: 0.05, wind: 0.1, biomass: 0.75, hydro: 1.0 },
};

/** 24-hour solar "shape": peaks at noon, zero before 6 and after 18. */
export const SOLAR_SHAPE_24H: number[] = (() => {
  const arr = Array.from({ length: 24 }, (_, h) => {
    if (h < 6 || h > 18) return 0;
    // sine bell centered at hour 12
    const x = (h - 6) / 12; // 0..1
    return Math.sin(x * Math.PI);
  });
  const sum = arr.reduce((a, b) => a + b, 0);
  return arr.map((v) => v / sum); // normalize to sum=1
})();

/** Wind shape: stronger evening + night, mellow afternoon. */
export const WIND_SHAPE_24H: number[] = (() => {
  const arr = Array.from({ length: 24 }, (_, h) => {
    // bias: low at 13-15, high at 18-23 and 0-5
    return 0.7 + 0.5 * Math.cos(((h - 21) * 2 * Math.PI) / 24);
  });
  const sum = arr.reduce((a, b) => a + b, 0);
  return arr.map((v) => v / sum);
})();

/** Residential + EV lifestyle load shape: peaks at evening 18-22. */
export const LIFESTYLE_SHAPE_24H: number[] = (() => {
  const peakHours: Record<number, number> = {
    0: 0.7, 1: 0.6, 2: 0.55, 3: 0.5, 4: 0.5, 5: 0.55,
    6: 0.7, 7: 0.85, 8: 0.95, 9: 1.0, 10: 1.05, 11: 1.1,
    12: 1.15, 13: 1.15, 14: 1.2, 15: 1.2, 16: 1.15, 17: 1.2,
    18: 1.4, 19: 1.5, 20: 1.45, 21: 1.3, 22: 1.05, 23: 0.85,
  };
  const arr = Array.from({ length: 24 }, (_, h) => peakHours[h]);
  const sum = arr.reduce((a, b) => a + b, 0);
  return arr.map((v) => v / sum);
})();

/** USD → THB (rough 2046 estimate). */
export const USD_TO_THB = 36;

/** Source colors for charts. */
export const SOURCE_COLORS = {
  solar: "oklch(0.83 0.17 75)", // amber
  wind: "oklch(0.78 0.14 235)", // sky
  biomass: "oklch(0.78 0.18 155)", // emerald
  hydro: "oklch(0.72 0.15 200)", // teal
  battery: "oklch(0.7 0.2 290)", // violet
  grid: "oklch(0.5 0.01 270)", // gray
  demand: "oklch(0.96 0.005 270)", // fg
  deficit: "oklch(0.72 0.2 20)", // rose
} as const;
