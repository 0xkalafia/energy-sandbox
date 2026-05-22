import type { KPIs } from "@/data/types";

export interface YearProjection {
  year: number; // 1-indexed
  revenue: number;
  opex: number;
  net: number;
  cumulative: number; // includes -CAPEX from year 0
}

export interface MultiYearOptions {
  /** simulation horizon in years */
  years: number;
  /** demand growth per year (e.g. 0.015 = +1.5%) */
  demandGrowth: number;
  /** carbon credit price growth */
  carbonPriceGrowth: number;
  /** OPEX inflation */
  opexInflation: number;
  /** discount rate for NPV (0..1). 0 = no discount */
  discountRate: number;
}

export const DEFAULT_MULTI_YEAR: MultiYearOptions = {
  years: 20,
  demandGrowth: 0.015,
  carbonPriceGrowth: 0.03,
  opexInflation: 0.025,
  discountRate: 0.0,
};

/**
 * Project annual cashflow over N years from the steady-state KPIs.
 *
 * Simplifying assumptions (MVP):
 * - CAPEX is paid in year 0 (booked as cumulative starting value)
 * - Revenue components grow at different rates (carbon price, methanol price,
 *   etc.) — we lump them as a single growth rate per category.
 * - Battery augmentation cost is folded into OPEX inflation
 * - No discounting unless discountRate > 0
 */
export function projectMultiYear(
  kpis: KPIs,
  opts: MultiYearOptions,
): {
  rows: YearProjection[];
  paybackYear: number | null; // first year cumulative ≥ 0
  totalLifetimeNet: number;
  irrApprox: number;
} {
  const rows: YearProjection[] = [];
  let cumulative = -kpis.capexEstimate;

  const baseRevenue =
    kpis.carbonCreditRevenue +
    kpis.methanolRevenue +
    kpis.dcLeasingRevenue +
    kpis.costAvoidance;

  let paybackYear: number | null = null;

  for (let y = 1; y <= opts.years; y++) {
    // Revenue grows mainly via carbon price and avoided costs
    // Demand growth slightly inflates cost avoidance.
    const carbonFactor = Math.pow(1 + opts.carbonPriceGrowth, y - 1);
    const demandFactor = Math.pow(1 + opts.demandGrowth, y - 1);
    const revenue =
      kpis.carbonCreditRevenue * carbonFactor +
      kpis.methanolRevenue * (1 + 0.5 * opts.carbonPriceGrowth) ** (y - 1) +
      kpis.dcLeasingRevenue * (1 + 0.5 * opts.demandGrowth) ** (y - 1) +
      kpis.costAvoidance * demandFactor;

    const opex = kpis.opexEstimate * Math.pow(1 + opts.opexInflation, y - 1);
    const net = revenue - opex;
    const discounted = net / Math.pow(1 + opts.discountRate, y);

    cumulative += discounted;

    if (paybackYear === null && cumulative >= 0) {
      paybackYear = y;
    }

    rows.push({
      year: y,
      revenue,
      opex,
      net,
      cumulative,
    });
  }

  // Crude IRR approximation: NPV-zero rate by bisection
  const irr = approxIRR(kpis.capexEstimate, rows.map((r) => r.net));

  // Touch baseRevenue so it appears used (kept here in case downstream
  // consumers want a "year 1 base revenue" reference).
  void baseRevenue;

  return {
    rows,
    paybackYear,
    totalLifetimeNet: cumulative,
    irrApprox: irr,
  };
}

function approxIRR(capex: number, netByYear: number[]): number {
  const npv = (rate: number) =>
    -capex +
    netByYear.reduce((sum, net, i) => sum + net / Math.pow(1 + rate, i + 1), 0);

  // Bisection between 0 and 0.5
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
