// ---------- Core simulation types ----------

export type Season = "summer" | "rainy" | "winter" | "monsoon";

export const SEASONS: { id: Season; label: string; emoji: string }[] = [
  { id: "summer", label: "หน้าร้อน", emoji: "☀️" },
  { id: "rainy", label: "หน้าฝน", emoji: "🌧️" },
  { id: "winter", label: "หน้าหนาว", emoji: "❄️" },
  { id: "monsoon", label: "มรสุม (worst)", emoji: "⛈️" },
];

/** All knobs the user can turn from the sidebar. */
export interface SimInputs {
  // Supply — installed capacity (MW)
  solarMW: number;
  windMW: number;
  biomassMW: number;
  hydroMW: number;

  // Demand modules (toggle + intensity)
  lifestyleGWhPerDay: number; // base load
  dacOn: boolean;
  dacTargetMtPerYear: number; // million tonnes CO2 captured per year
  methanolOn: boolean;
  methanolKtPerYear: number; // thousand tonnes E-methanol per year
  /** 0..1 — share of methanol used locally (displaces fuel) vs exported (sold).
   *  Prevents double-counting: a ton is EITHER sold OR burned locally, not both. */
  methanolLocalShare: number;
  dataCenterOn: boolean;
  dataCenterMW: number;
  desalOn: boolean;
  desalMm3PerYear: number; // million m³ water per year
  wasteOn: boolean;
  wasteTonPerDay: number; // tonnes per day (incl. legacy mining)
  wwtOn: boolean;
  wwtCoverage: number; // 0..1

  // Battery
  batteryGWh: number;
  batteryDoDFloor: number; // 0..1, e.g. 0.10 = floor at 10%
  batteryRoundTrip: number; // 0..1, e.g. 0.90
  batteryPricePerKWh: number; // baht per kWh (full system)

  // Pricing assumptions
  gridBuyPrice: number; // baht/kWh
  gridSellPrice: number; // baht/kWh
  fuelPrice: number; // baht/liter
  carbonPrice: number; // USD/ton
  methanolPrice: number; // USD/ton

  // Scenario
  season: Season;
}

export interface HourlyPoint {
  hour: number; // 0..23
  // supply (MW averaged over the hour)
  solar: number;
  wind: number;
  biomass: number;
  hydro: number;
  // demand (MW)
  lifestyle: number;
  dac: number;
  methanol: number;
  dataCenter: number;
  desal: number;
  waste: number;
  wwt: number;
  // derived (MW)
  totalSupply: number;
  totalDemand: number; // = critical + flexible WANT level (before curtailment)
  net: number; // supply - demand
  batterySoC: number; // 0..1
  batteryFlow: number; // + charging, - discharging (MW)
  gridImport: number; // MW (>=0)
  gridExport: number; // MW (>=0)
  unmet: number; // MW (>=0) — CRITICAL load shed (true blackout) after battery+grid exhausted
  curtailed: number; // MW (>=0) — FLEXIBLE mission load curtailed (interruptible, not a blackout)
}

export interface KPIs {
  // Daily aggregates (GWh)
  dailySupplyGWh: number;
  dailyDemandGWh: number;
  dailySurplusGWh: number;
  dailyImportGWh: number;
  dailyExportGWh: number;

  // Battery
  batteryCyclesPerDay: number;
  batteryMinSoC: number;
  batteryMaxSoC: number;
  batteryLifespanYears: number;

  // Yearly
  yearlyDemandGWh: number;
  yearlyEmissionTon: number; // CO2 emitted (gross, after EV transition)
  yearlyCaptureTon: number; // CO2 captured by DAC
  netCarbonTon: number;
  carbonCreditRevenue: number; // baht
  methanolRevenue: number; // baht (export share only)
  dcLeasingRevenue: number; // baht
  costAvoidance: number; // baht (fuel+electricity not bought)
  /** Portion of costAvoidance that scales with EV adoption (lifestyle electricity).
   *  multiYear scales only this part year-over-year, not desal/waste/wwt. */
  costAvoidanceEvSensitive: number; // baht
  /** Phase 3.4: co-products from green H2 production (O2 + waste heat) */
  hydrogenCoProductRevenue: number; // baht
  oxygenTonPerYear: number; // tonnes O2 produced as by-product
  wasteHeatGWhPerYear: number; // recoverable thermal energy
  totalAnnualValue: number; // baht

  // Investment
  capexEstimate: number; // baht
  opexEstimate: number; // baht/year
  paybackYears: number;
}
