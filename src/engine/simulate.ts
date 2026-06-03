import type { HourlyPoint, KPIs, SimInputs } from "@/data/types";
import {
  CF_BY_SEASON,
  ENERGY_INTENSITY,
  LIFESTYLE_SHAPE_24H,
  SOLAR_SHAPE_24H,
  USD_TO_THB,
  WIND_SHAPE_24H,
} from "@/data/constants";

const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365;

// ---------- Helpers ----------

/** Hourly average MW from daily energy in GWh, distributed by a 24h shape. */
function shapeHourlyMW(dailyGWh: number, shape24: number[]): number[] {
  // dailyGWh * 1000 = MWh/day. shape sums to 1, so each hour gets shape*MWh,
  // which is MWh in that 1-hour bucket → equals MW average over that hour.
  const mwhPerDay = dailyGWh * 1000;
  return shape24.map((s) => s * mwhPerDay);
}

// ---------- Demand sizing ----------

interface DemandSizes {
  // GWh per day (averaged)
  lifestyle: number;
  dac: number;
  methanol: number;
  dataCenter: number;
  desal: number;
  waste: number;
  wwt: number;
  totalAnnualGWh: number;
}

export function computeDemandSizes(i: SimInputs): DemandSizes {
  const E = ENERGY_INTENSITY;

  // DAC: tonnes/year × kWh/ton → GWh/year → GWh/day
  const dacAnnualGWh = i.dacOn
    ? (i.dacTargetMtPerYear * 1e6 * E.dacKWhPerTon) / 1e6
    : 0;

  // E-Methanol: thousand tons/year of methanol
  // - H2 needed: kt * h2PerMethanolTon (in kg → divide later)
  // - electrolyzer kWh = kg_H2 × kWh/kg
  // - synthesis kWh = methanol_ton × kWh/ton
  const methanolTons = i.methanolKtPerYear * 1e3;
  const h2KgNeeded = methanolTons * E.h2PerMethanolTon;
  const methanolAnnualGWh = i.methanolOn
    ? (h2KgNeeded * E.electrolyzerKWhPerKgH2 +
        methanolTons * E.methanolSynthesisKWhPerTon) /
      1e6
    : 0;

  // Data center: MW × 24 × 365 → GWh/year
  const dcAnnualGWh = i.dataCenterOn
    ? (i.dataCenterMW * HOURS_PER_DAY * DAYS_PER_YEAR) / 1000
    : 0;

  // Desalination
  const desalAnnualGWh = i.desalOn
    ? (i.desalMm3PerYear * 1e6 * E.desalKWhPerM3) / 1e6
    : 0;

  // Waste plasma
  const wasteAnnualGWh = i.wasteOn
    ? (i.wasteTonPerDay * DAYS_PER_YEAR * E.plasmaKWhPerTon) / 1e6
    : 0;

  // Wastewater: pop × L/person/day × coverage → m³/year × kWh/m³ → GWh/year
  const wwtAnnualGWh = i.wwtOn
    ? (E.populationPhet2046 *
        E.wwtLitersPerPersonPerDay *
        i.wwtCoverage *
        DAYS_PER_YEAR *
        E.wwtKWhPerM3) /
      1e6 /
      1000
    : 0;
  // (population L/day × days = liters/year, /1000 = m³/year, × kWh/m³ /1e6 = GWh)

  const lifestyleAnnualGWh = i.lifestyleGWhPerDay * DAYS_PER_YEAR;

  const totalAnnualGWh =
    lifestyleAnnualGWh +
    dacAnnualGWh +
    methanolAnnualGWh +
    dcAnnualGWh +
    desalAnnualGWh +
    wasteAnnualGWh +
    wwtAnnualGWh;

  return {
    lifestyle: i.lifestyleGWhPerDay,
    dac: dacAnnualGWh / DAYS_PER_YEAR,
    methanol: methanolAnnualGWh / DAYS_PER_YEAR,
    dataCenter: dcAnnualGWh / DAYS_PER_YEAR,
    desal: desalAnnualGWh / DAYS_PER_YEAR,
    waste: wasteAnnualGWh / DAYS_PER_YEAR,
    wwt: wwtAnnualGWh / DAYS_PER_YEAR,
    totalAnnualGWh,
  };
}

// ---------- Hourly simulation ----------

export interface DispatchOpts {
  /** Initial state of charge fraction (0..1). Default 0.5. */
  startSoC?: number;
  /**
   * Max grid import per hour (MW). Default Infinity = grid-backed (normal ops:
   * grid is the backstop, nothing is ever shed). A finite value models an
   * islanded / capped-interconnect stress test: once supply + battery + the
   * capped grid are exhausted, FLEXIBLE missions curtail and, in the worst
   * case, CRITICAL load is shed (true blackout → `unmet`).
   */
  gridLimitMW?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function simulateDay(
  i: SimInputs,
  opts: DispatchOpts = {},
): HourlyPoint[] {
  const startSoC = clamp01(opts.startSoC ?? 0.5);
  const gridLimit = opts.gridLimitMW ?? Infinity;

  const cf = CF_BY_SEASON[i.season];

  // Daily energy from each source (GWh)
  const solarDailyGWh = (i.solarMW * HOURS_PER_DAY * cf.solar) / 1000;
  const windDailyGWh = (i.windMW * HOURS_PER_DAY * cf.wind) / 1000;
  const biomassDailyGWh = (i.biomassMW * HOURS_PER_DAY * cf.biomass) / 1000;
  const hydroDailyGWh = (i.hydroMW * HOURS_PER_DAY * cf.hydro) / 1000;

  // Hourly MW arrays (length 24)
  const solar = shapeHourlyMW(solarDailyGWh, SOLAR_SHAPE_24H);
  const wind = shapeHourlyMW(windDailyGWh, WIND_SHAPE_24H);
  // biomass + hydro = flat
  const biomass = Array(24).fill((biomassDailyGWh * 1000) / 24);
  const hydro = Array(24).fill((hydroDailyGWh * 1000) / 24);

  // Demand sizing
  const d = computeDemandSizes(i);
  const lifestyle = shapeHourlyMW(d.lifestyle, LIFESTYLE_SHAPE_24H);
  // Flexible loads = flat baseline (could be smarter; MVP keeps simple)
  const dac = Array(24).fill((d.dac * 1000) / 24);
  const methanol = Array(24).fill((d.methanol * 1000) / 24);
  const dataCenter = Array(24).fill((d.dataCenter * 1000) / 24);
  const desal = Array(24).fill((d.desal * 1000) / 24);
  const waste = Array(24).fill((d.waste * 1000) / 24);
  const wwt = Array(24).fill((d.wwt * 1000) / 24);

  // Battery state
  const batteryCapMWh = i.batteryGWh * 1000;
  const minSoC = i.batteryDoDFloor;
  const maxSoC = 1.0;
  let socMWh = batteryCapMWh * startSoC;
  const sqrtRT = Math.sqrt(i.batteryRoundTrip); // split loss across charge & discharge
  const maxBatteryMW = batteryCapMWh * 0.25; // 0.25C power rating

  const out: HourlyPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const supply = solar[h] + wind[h] + biomass[h] + hydro[h];
    const critical = lifestyle[h]; // must-serve
    const flexibleWant =
      dac[h] + methanol[h] + dataCenter[h] + desal[h] + waste[h] + wwt[h];
    const totalDemand = critical + flexibleWant;

    // Per-hour dispatch budgets
    let s = supply; // remaining renewable supply to allocate
    const dischargeableMWh = Math.max(0, socMWh - batteryCapMWh * minSoC);
    let dischargeBudget = Math.min(maxBatteryMW, dischargeableMWh * sqrtRT); // MW delivered
    let gridBudget = gridLimit;

    let batteryDischargeMW = 0;
    let gridImport = 0;
    let unmet = 0;
    let curtailed = 0;

    // Serve a load tier through the merit order: supply → battery → grid → shed.
    // CRITICAL is served first so it gets battery/grid priority; FLEXIBLE only
    // gets what's left and is curtailed (not blacked out) when scarce.
    const serve = (want: number, isCritical: boolean) => {
      let rem = want;
      const fromSupply = Math.min(rem, s);
      s -= fromSupply;
      rem -= fromSupply;
      const fromBatt = Math.min(rem, dischargeBudget);
      dischargeBudget -= fromBatt;
      batteryDischargeMW += fromBatt;
      rem -= fromBatt;
      const fromGrid = Math.min(rem, gridBudget);
      gridBudget -= fromGrid;
      gridImport += fromGrid;
      rem -= fromGrid;
      if (rem > 1e-9) {
        if (isCritical) unmet += rem;
        else curtailed += rem;
      }
    };

    serve(critical, true);
    serve(flexibleWant, false);

    // Surplus supply → charge battery → export
    let batteryChargeMW = 0;
    let gridExport = 0;
    if (s > 0) {
      const headroom = Math.max(0, batteryCapMWh * maxSoC - socMWh);
      const charge = Math.min(s, maxBatteryMW, headroom / sqrtRT);
      batteryChargeMW = charge;
      gridExport = s - charge;
    }

    // Apply energy changes to the cell
    socMWh += batteryChargeMW * sqrtRT;
    socMWh -= batteryDischargeMW / sqrtRT;
    socMWh = Math.max(0, Math.min(batteryCapMWh, socMWh));

    out.push({
      hour: h,
      solar: solar[h],
      wind: wind[h],
      biomass: biomass[h],
      hydro: hydro[h],
      lifestyle: lifestyle[h],
      dac: dac[h],
      methanol: methanol[h],
      dataCenter: dataCenter[h],
      desal: desal[h],
      waste: waste[h],
      wwt: wwt[h],
      totalSupply: supply,
      totalDemand,
      net: supply - totalDemand,
      batterySoC: socMWh / batteryCapMWh,
      batteryFlow: batteryChargeMW - batteryDischargeMW,
      gridImport,
      gridExport,
      unmet,
      curtailed,
    });
  }
  return out;
}

// ---------- KPI aggregation ----------

export function computeKPIs(i: SimInputs, hourly: HourlyPoint[]): KPIs {
  const sumMW = (key: keyof HourlyPoint) =>
    hourly.reduce((a, h) => a + (h[key] as number), 0);

  const dailySupplyMWh = sumMW("totalSupply");
  const dailyDemandMWh = sumMW("totalDemand");
  const dailyImportMWh = sumMW("gridImport");
  const dailyExportMWh = sumMW("gridExport");

  // Battery cycles per day = (total discharge) / capacity
  const totalDischargeMWh = hourly.reduce(
    (a, h) => a + Math.max(0, -h.batteryFlow),
    0,
  );
  const batteryCapMWh = i.batteryGWh * 1000;
  const cyclesPerDay = totalDischargeMWh / batteryCapMWh;

  const socs = hourly.map((h) => h.batterySoC);
  const minSoC = Math.min(...socs);
  const maxSoC = Math.max(...socs);

  // Sodium-ion typical: 5000 cycles → lifespan
  const SOLID_CYCLES = 5000;
  const lifespanYears =
    cyclesPerDay > 0 ? SOLID_CYCLES / (cyclesPerDay * 365) : 99;

  // Annual extrapolation (simple: × 365 — could weight by season later)
  const d = computeDemandSizes(i);
  const yearlyDemandGWh = d.totalAnnualGWh;

  // Carbon model: Phetchaburi 2046 baseline 500k ton gross
  const grossEmission = 500_000;
  const capturedTon = i.dacOn ? i.dacTargetMtPerYear * 1e6 : 0;
  const netCarbon = grossEmission - capturedTon;

  const carbonCreditRev = capturedTon * i.carbonPrice * USD_TO_THB;

  // Methanol: a ton is EITHER exported (sold at methanolPrice) OR used locally
  // (displaces fuel) — never both. `methanolLocalShare` splits the tonnage so
  // export revenue and fuel-saving don't double-count the same molecules.
  const methanolTons = i.methanolOn ? i.methanolKtPerYear * 1e3 : 0;
  const localShare = clamp01(i.methanolLocalShare);
  const methanolExportTons = methanolTons * (1 - localShare);
  const methanolLocalTons = methanolTons * localShare;

  const methanolRev = methanolExportTons * i.methanolPrice * USD_TO_THB;
  // Fuel avoidance only for the locally-consumed share (rough: 600 L-equiv per
  // ton methanol at ~50% of diesel energy density).
  const fuelSaving = methanolLocalTons * 600 * (i.fuelPrice * 0.5);

  // MW × hr × days = MWh; × 1000 = kWh; × baht/kWh = baht; × 0.4 = lease take-rate
  const dcLeasingRev = i.dataCenterOn
    ? i.dataCenterMW *
      HOURS_PER_DAY *
      DAYS_PER_YEAR *
      1000 *
      i.gridSellPrice *
      0.4
    : 0;

  // Cost avoidance: electricity not bought from grid, split so multiYear can
  // grow only the EV-sensitive (lifestyle) part year-over-year.
  const lifestyleSaving = d.lifestyle * DAYS_PER_YEAR * 1e6 * i.gridBuyPrice;
  const servicesSaving =
    (d.desal + d.waste + d.wwt) * DAYS_PER_YEAR * 1e6 * i.gridBuyPrice;
  const electricitySaving = lifestyleSaving + servicesSaving;

  const costAvoidance = electricitySaving + fuelSaving;
  const costAvoidanceEvSensitive = lifestyleSaving;

  // Phase 3.4: Hydrogen co-product revenue
  // Stoichiometry: every kg H2 produces 8 kg O2 as by-product.
  // Methanol synthesis needs 187 kg H2 per ton methanol (see ENERGY_INTENSITY).
  // Waste heat: electrolyzer + synthesis releases ~25% of input energy as heat.
  const h2KgProduced = i.methanolOn
    ? i.methanolKtPerYear * 1e3 * ENERGY_INTENSITY.h2PerMethanolTon
    : 0;
  const oxygenTon = (h2KgProduced * 8) / 1000;
  // Industrial O2 ~ 5 baht/kg (medical-grade higher, but be conservative)
  const oxygenRev = oxygenTon * 1000 * 5;

  // Waste heat captured ~ electrolyzer energy × 0.20 (recoverable fraction)
  const electrolyzerKWh = h2KgProduced * ENERGY_INTENSITY.electrolyzerKWhPerKgH2;
  const wasteHeatGWh = (electrolyzerKWh * 0.2) / 1e6;
  // Value of waste heat as displaced industrial heating fuel (~1.5 baht/kWh-th)
  const wasteHeatRev = wasteHeatGWh * 1e6 * 1.5;

  const hydrogenCoProductRev = oxygenRev + wasteHeatRev;

  const totalAnnualValue =
    carbonCreditRev +
    methanolRev +
    dcLeasingRev +
    costAvoidance +
    hydrogenCoProductRev;

  // CAPEX rough estimate (very simplified)
  // Solar: 25M baht/MW · Wind: 50M baht/MW · Battery: price/kWh × kWh
  // Plants (DAC/H2/Methanol/Plasma/DC): lump sum
  const capex =
    i.solarMW * 25e6 +
    i.windMW * 50e6 +
    i.biomassMW * 80e6 +
    i.batteryGWh * 1e6 * i.batteryPricePerKWh +
    (i.dacOn ? 30e9 : 0) +
    (i.methanolOn ? 50e9 : 0) +
    (i.dataCenterOn ? 20e9 : 0) +
    (i.desalOn ? 15e9 : 0) +
    (i.wasteOn ? 10e9 : 0);

  const opex = capex * 0.025; // 2.5%/year

  const netRevenue = totalAnnualValue - opex;
  const paybackYears = netRevenue > 0 ? capex / netRevenue : 99;

  return {
    dailySupplyGWh: dailySupplyMWh / 1000,
    dailyDemandGWh: dailyDemandMWh / 1000,
    dailySurplusGWh: (dailySupplyMWh - dailyDemandMWh) / 1000,
    dailyImportGWh: dailyImportMWh / 1000,
    dailyExportGWh: dailyExportMWh / 1000,
    batteryCyclesPerDay: cyclesPerDay,
    batteryMinSoC: minSoC,
    batteryMaxSoC: maxSoC,
    batteryLifespanYears: Math.min(lifespanYears, 40),
    yearlyDemandGWh,
    yearlyEmissionTon: grossEmission,
    yearlyCaptureTon: capturedTon,
    netCarbonTon: netCarbon,
    carbonCreditRevenue: carbonCreditRev,
    methanolRevenue: methanolRev,
    dcLeasingRevenue: dcLeasingRev,
    costAvoidance: costAvoidance,
    costAvoidanceEvSensitive,
    hydrogenCoProductRevenue: hydrogenCoProductRev,
    oxygenTonPerYear: oxygenTon,
    wasteHeatGWhPerYear: wasteHeatGWh,
    totalAnnualValue,
    capexEstimate: capex,
    opexEstimate: opex,
    paybackYears,
  };
}
