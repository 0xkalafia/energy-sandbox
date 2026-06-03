import type { KPIs, SimInputs } from "@/data/types";

export interface YearProjection {
  year: number; // 1-indexed
  revenue: number;
  revenueLow: number;
  revenueHigh: number;
  opex: number;
  augmentation: number; // baht spent topping up battery cells this year
  net: number;
  cumulative: number; // includes -CAPEX from year 0
  cumulativeLow: number;
  cumulativeHigh: number;
  // Engineering state
  batteryEffectiveGWh: number; // capacity remaining (after degradation, before top-up)
  batteryRatedGWh: number; // target capacity (constant if augmentation enabled)
  lifestyleGWhPerDay: number;
  evPenetration: number; // 0..1
}

export interface MultiYearOptions {
  /** simulation horizon in years */
  years: number;
  /** OPEX inflation (e.g. 0.025 = 2.5%/yr) */
  opexInflation: number;
  /** discount rate for NPV (0..1). 0 = no discount */
  discountRate: number;
  /** Battery degradation per year (e.g. 0.015 = 1.5%/yr capacity loss) */
  batteryDegradation: number;
  /** Augment battery yearly to keep rated capacity? */
  augmentationEnabled: boolean;
  /** Carbon price growth (mid scenario), e.g. 0.04 = +4%/yr */
  carbonPriceGrowth: number;
  /** Carbon price uncertainty +/- (e.g. 0.4 = ±40% by horizon) */
  carbonPriceUncertainty: number;
  /** EV adoption final ceiling (0..1), e.g. 0.85 = 85% EVs */
  evAdoptionCeiling: number;
  /** S-curve midpoint year (year where adoption reaches half of ceiling) */
  evAdoptionMidpoint: number;
  /** S-curve steepness (higher = sharper transition) */
  evAdoptionSteepness: number;
  /** Per-kWh lifestyle load impact from full EV adoption (e.g. 1.6 = 60% more load when 100% EV) */
  evLoadMultiplier: number;
}

export const DEFAULT_MULTI_YEAR: MultiYearOptions = {
  years: 20,
  opexInflation: 0.025,
  discountRate: 0.0,
  batteryDegradation: 0.015,
  augmentationEnabled: true,
  carbonPriceGrowth: 0.04,
  carbonPriceUncertainty: 0.4,
  evAdoptionCeiling: 0.85,
  evAdoptionMidpoint: 8,
  evAdoptionSteepness: 0.35,
  evLoadMultiplier: 1.6,
};

/**
 * Logistic S-curve for EV adoption:
 *   P(year) = ceiling / (1 + e^(-k(year - midpoint)))
 */
function evAdoption(year: number, opts: MultiYearOptions): number {
  return (
    opts.evAdoptionCeiling /
    (1 + Math.exp(-opts.evAdoptionSteepness * (year - opts.evAdoptionMidpoint)))
  );
}

/**
 * Project annual cashflow over N years from the steady-state KPIs.
 *
 * Engineering refinements (Phase 3):
 * - Battery degrades by `batteryDegradation` every year
 * - If augmentation enabled, top-up cells each year to restore rated capacity
 *   (cost = degraded_GWh × current cell price)
 * - Lifestyle load grows along EV adoption S-curve
 * - Carbon price drifts at growth rate ± uncertainty for low/high bands
 */
export function projectMultiYear(
  kpis: KPIs,
  inputs: SimInputs,
  opts: MultiYearOptions,
): {
  rows: YearProjection[];
  paybackYear: number | null;
  totalLifetimeNet: number;
  irrApprox: number;
  totalAugmentation: number;
} {
  const rows: YearProjection[] = [];
  let cumulative = -kpis.capexEstimate;
  let cumulativeLow = -kpis.capexEstimate;
  let cumulativeHigh = -kpis.capexEstimate;

  const ratedGWh = inputs.batteryGWh;
  const pricePerKWh = inputs.batteryPricePerKWh;
  let effectiveGWh = ratedGWh;

  // Lifestyle load baseline = inputs.lifestyleGWhPerDay (today's level, 0% EV)
  // We treat that as the "0% EV" reference. As adoption grows, load grows.
  const baseLifestyle = inputs.lifestyleGWhPerDay;
  const initialPenetration = 0.05; // assume 5% EVs in year 0

  // Cost-avoidance splits into an EV-sensitive part (lifestyle electricity,
  // grows with adoption) and a flat part (desal/waste/wwt + fuel saving).
  const costAvoidEvSensitive = kpis.costAvoidanceEvSensitive;
  const costAvoidFlat = kpis.costAvoidance - costAvoidEvSensitive;
  const baseCarbonRevenue = kpis.carbonCreditRevenue;

  let paybackYear: number | null = null;
  let totalAugmentation = 0;

  for (let y = 1; y <= opts.years; y++) {
    // 1. Battery degradation this year
    effectiveGWh *= 1 - opts.batteryDegradation;

    // 2. Augmentation: top up to rated capacity if enabled
    let augmentationCost = 0;
    if (opts.augmentationEnabled) {
      const gap = ratedGWh - effectiveGWh;
      if (gap > 0) {
        // Cell price decreases ~5%/yr (learning curve) — apply yearly
        const yearPrice = pricePerKWh * Math.pow(0.95, y - 1);
        augmentationCost = gap * 1e6 * yearPrice; // GWh → kWh × baht/kWh
        effectiveGWh = ratedGWh;
      }
    }
    totalAugmentation += augmentationCost;

    // 3. EV adoption + lifestyle growth
    const ev = evAdoption(y, opts);
    const evGrowthFactor =
      1 + (opts.evLoadMultiplier - 1) * ((ev - initialPenetration) / (1 - initialPenetration));
    const lifestyleScale = Math.max(1, evGrowthFactor);

    // 4. Revenue model
    const carbonFactor = Math.pow(1 + opts.carbonPriceGrowth, y - 1);
    const carbonMid = baseCarbonRevenue * carbonFactor;
    // Uncertainty widens with time (sqrt-of-time rule of thumb)
    const uncertaintyAtY = opts.carbonPriceUncertainty * Math.sqrt(y / opts.years);
    const carbonLow = carbonMid * (1 - uncertaintyAtY);
    const carbonHigh = carbonMid * (1 + uncertaintyAtY);

    // Only the lifestyle-electricity part of cost avoidance grows with EV
    // adoption; desal/waste/wwt + fuel saving stay flat.
    const methanolFactor = Math.pow(1 + 0.5 * opts.carbonPriceGrowth, y - 1);
    const dcFactor = Math.pow(1 + 0.5 * opts.carbonPriceGrowth, y - 1);

    const revenueOther =
      kpis.methanolRevenue * methanolFactor +
      kpis.dcLeasingRevenue * dcFactor +
      costAvoidFlat +
      costAvoidEvSensitive * lifestyleScale;

    const revenue = carbonMid + revenueOther;
    const revenueLow = carbonLow + revenueOther;
    const revenueHigh = carbonHigh + revenueOther;

    // 5. OPEX
    const opex =
      kpis.opexEstimate * Math.pow(1 + opts.opexInflation, y - 1) + augmentationCost;

    const net = revenue - opex;
    const netLow = revenueLow - opex;
    const netHigh = revenueHigh - opex;

    const discountFactor = Math.pow(1 + opts.discountRate, y);
    cumulative += net / discountFactor;
    cumulativeLow += netLow / discountFactor;
    cumulativeHigh += netHigh / discountFactor;

    if (paybackYear === null && cumulative >= 0) {
      paybackYear = y;
    }

    rows.push({
      year: y,
      revenue,
      revenueLow,
      revenueHigh,
      opex,
      augmentation: augmentationCost,
      net,
      cumulative,
      cumulativeLow,
      cumulativeHigh,
      batteryEffectiveGWh: effectiveGWh,
      batteryRatedGWh: ratedGWh,
      lifestyleGWhPerDay: baseLifestyle * lifestyleScale,
      evPenetration: ev,
    });
  }

  const irr = approxIRR(kpis.capexEstimate, rows.map((r) => r.net));

  return {
    rows,
    paybackYear,
    totalLifetimeNet: cumulative,
    irrApprox: irr,
    totalAugmentation,
  };
}

function approxIRR(capex: number, netByYear: number[]): number {
  const npv = (rate: number) =>
    -capex +
    netByYear.reduce((sum, net, i) => sum + net / Math.pow(1 + rate, i + 1), 0);

  let lo = -0.5;
  let hi = 1.0;
  if (npv(lo) * npv(hi) > 0) return Number.NaN;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
