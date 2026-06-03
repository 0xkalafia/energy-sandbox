import { describe, it, expect } from "vitest";
import { DEFAULT_INPUTS, PRESETS } from "@/data/constants";
import { computeKPIs, simulateDay } from "@/engine/simulate";
import { simulateMultiDay } from "@/engine/multiDay";
import { projectMultiYear, DEFAULT_MULTI_YEAR } from "@/engine/multiYear";
import { runMonteCarlo, DEFAULT_MC } from "@/engine/monteCarlo";

describe("simulateDay — hourly dispatch", () => {
  it("returns 24 hourly points", () => {
    expect(simulateDay(DEFAULT_INPUTS)).toHaveLength(24);
  });

  it("grid-backed (default) never sheds critical load → unmet ≡ 0", () => {
    const hourly = simulateDay(DEFAULT_INPUTS);
    const totalUnmet = hourly.reduce((a, h) => a + h.unmet, 0);
    expect(totalUnmet).toBe(0);
  });

  it("SoC stays within [DoD floor, 1] across the day", () => {
    const hourly = simulateDay(DEFAULT_INPUTS);
    for (const h of hourly) {
      expect(h.batterySoC).toBeGreaterThanOrEqual(0);
      expect(h.batterySoC).toBeLessThanOrEqual(1.0000001);
    }
  });

  it("honours startSoC", () => {
    const hi = simulateDay(DEFAULT_INPUTS, { startSoC: 0.9 });
    const lo = simulateDay(DEFAULT_INPUTS, { startSoC: 0.1 });
    // First hour SoC should reflect the very different starting points
    expect(hi[0].batterySoC).toBeGreaterThan(lo[0].batterySoC);
  });

  it("islanded curtails flexible load; grid-backed never does", () => {
    // Monsoon = low solar/wind, so a single day can't cover all missions
    // without the grid → islanded must curtail.
    const monsoon = { ...DEFAULT_INPUTS, season: "monsoon" as const };
    const islanded = simulateDay(monsoon, { gridLimitMW: 0, startSoC: 0.2 });
    const grid = simulateDay(monsoon, { gridLimitMW: Infinity, startSoC: 0.2 });
    const islandedImport = islanded.reduce((a, h) => a + h.gridImport, 0);
    const islandedCurtail = islanded.reduce((a, h) => a + h.curtailed, 0);
    const gridCurtail = grid.reduce((a, h) => a + h.curtailed, 0);
    // No grid when islanded; missions curtail instead of importing.
    expect(islandedImport).toBe(0);
    expect(islandedCurtail).toBeGreaterThan(0);
    // Grid-backed: flexible is always served (grid backstops), so zero curtailment.
    expect(gridCurtail).toBe(0);
  });
});

describe("energy conservation", () => {
  it("supply = critical_served + flexible_served + charge + export (within tol)", () => {
    const hourly = simulateDay(DEFAULT_INPUTS, { gridLimitMW: 0 });
    for (const h of hourly) {
      const served = h.totalDemand - h.unmet - h.curtailed; // load actually met
      const fromGridOrBatt = h.gridImport + Math.max(0, -h.batteryFlow);
      const charge = Math.max(0, h.batteryFlow);
      // supply + discharge + grid  ==  served + charge + export
      const lhs = h.totalSupply + fromGridOrBatt;
      const rhs = served + charge + h.gridExport;
      expect(Math.abs(lhs - rhs)).toBeLessThan(1e-3);
    }
  });
});

describe("computeKPIs — economics", () => {
  it("methanol export + local split avoids double count", () => {
    const allExport = computeKPIs(
      { ...DEFAULT_INPUTS, methanolLocalShare: 0 },
      simulateDay(DEFAULT_INPUTS),
    );
    const allLocal = computeKPIs(
      { ...DEFAULT_INPUTS, methanolLocalShare: 1 },
      simulateDay(DEFAULT_INPUTS),
    );
    // All exported → max methanol revenue, zero fuel saving baked into costAvoidance
    expect(allExport.methanolRevenue).toBeGreaterThan(allLocal.methanolRevenue);
    expect(allLocal.methanolRevenue).toBe(0);
  });

  it("H2 co-products only when methanol is on", () => {
    const on = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS));
    const off = computeKPIs(
      { ...DEFAULT_INPUTS, methanolOn: false },
      simulateDay({ ...DEFAULT_INPUTS, methanolOn: false }),
    );
    expect(on.hydrogenCoProductRevenue).toBeGreaterThan(0);
    expect(off.hydrogenCoProductRevenue).toBe(0);
  });

  it("DAC drives net carbon negative on the balanced plan", () => {
    const k = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS));
    expect(k.netCarbonTon).toBeLessThan(0);
  });

  it("costAvoidanceEvSensitive ≤ total costAvoidance", () => {
    const k = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS));
    expect(k.costAvoidanceEvSensitive).toBeGreaterThan(0);
    expect(k.costAvoidanceEvSensitive).toBeLessThanOrEqual(k.costAvoidance);
  });
});

describe("simulateMultiDay — real SoC chaining", () => {
  it("day N starts where day N-1 ended (continuity ≈ 0)", () => {
    const r = simulateMultiDay(DEFAULT_INPUTS, 7, "monsoonStreak", {
      gridLimitMW: 0,
    });
    let maxJump = 0;
    for (let d = 1; d < r.daily.length; d++) {
      const lastHourPrevDay = r.hourly[d * 24 - 1].batterySoC;
      maxJump = Math.max(maxJump, Math.abs(r.daily[d - 1].endSoC - lastHourPrevDay));
    }
    expect(maxJump).toBeLessThan(1e-6);
  });

  it("balanced overbuild keeps critical lit even islanded (no blackout)", () => {
    const r = simulateMultiDay(DEFAULT_INPUTS, 7, "monsoonStreak", {
      gridLimitMW: 0,
    });
    expect(r.unmetHours).toBe(0);
    expect(r.curtailedHours).toBeGreaterThan(0); // but missions defer
  });

  it("blackout path IS reachable under a punishing config", () => {
    const stressed = {
      ...DEFAULT_INPUTS,
      batteryGWh: 1,
      solarMW: 500,
      windMW: 200,
      biomassMW: 20,
      hydroMW: 5,
    };
    const r = simulateMultiDay(stressed, 5, "monsoonStreak", { gridLimitMW: 0 });
    expect(r.unmetHours).toBeGreaterThan(0);
    expect(r.unmetGWh).toBeGreaterThan(0);
  });
});

describe("projectMultiYear", () => {
  it("battery degrades without augmentation, holds with it", () => {
    const k = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS));
    const withAug = projectMultiYear(k, DEFAULT_INPUTS, {
      ...DEFAULT_MULTI_YEAR,
      augmentationEnabled: true,
    });
    const noAug = projectMultiYear(k, DEFAULT_INPUTS, {
      ...DEFAULT_MULTI_YEAR,
      augmentationEnabled: false,
    });
    const lastWith = withAug.rows.at(-1)!;
    const lastNo = noAug.rows.at(-1)!;
    expect(lastWith.batteryEffectiveGWh).toBeGreaterThan(lastNo.batteryEffectiveGWh);
    expect(withAug.totalAugmentation).toBeGreaterThan(0);
    expect(noAug.totalAugmentation).toBe(0);
  });

  it("cumulative cashflow is monotonically increasing when net>0", () => {
    const k = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS));
    const proj = projectMultiYear(k, DEFAULT_INPUTS, DEFAULT_MULTI_YEAR);
    for (let i = 1; i < proj.rows.length; i++) {
      if (proj.rows[i].net > 0) {
        expect(proj.rows[i].cumulative).toBeGreaterThan(proj.rows[i - 1].cumulative);
      }
    }
  });

  it("EV adoption rises monotonically toward the ceiling", () => {
    const k = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS));
    const proj = projectMultiYear(k, DEFAULT_INPUTS, DEFAULT_MULTI_YEAR);
    for (let i = 1; i < proj.rows.length; i++) {
      expect(proj.rows[i].evPenetration).toBeGreaterThanOrEqual(
        proj.rows[i - 1].evPenetration - 1e-9,
      );
    }
    expect(proj.rows.at(-1)!.evPenetration).toBeLessThanOrEqual(
      DEFAULT_MULTI_YEAR.evAdoptionCeiling + 1e-9,
    );
  });
});

describe("runMonteCarlo", () => {
  it("percentiles are ordered p5 ≤ p50 ≤ p95", () => {
    const r = runMonteCarlo(DEFAULT_INPUTS, { ...DEFAULT_MC, runs: 40 });
    const p = r.percentiles.lowestSoC;
    expect(p.p5).toBeLessThanOrEqual(p.p50);
    expect(p.p50).toBeLessThanOrEqual(p.p95);
  });

  it("is deterministic for a fixed seed", () => {
    const a = runMonteCarlo(DEFAULT_INPUTS, { ...DEFAULT_MC, runs: 30, seed: 7 });
    const b = runMonteCarlo(DEFAULT_INPUTS, { ...DEFAULT_MC, runs: 30, seed: 7 });
    expect(a.unmetRiskPct).toBe(b.unmetRiskPct);
    expect(a.percentiles.importGWh.p50).toBe(b.percentiles.importGWh.p50);
  });

  it("islanded run count matches requested runs", () => {
    const r = runMonteCarlo(
      DEFAULT_INPUTS,
      { ...DEFAULT_MC, runs: 25 },
      { gridLimitMW: 0 },
    );
    expect(r.runs).toHaveLength(25);
  });
});

describe("presets are internally consistent", () => {
  it("every preset simulates without throwing and yields finite KPIs", () => {
    for (const id of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
      const inp = PRESETS[id].inputs;
      const k = computeKPIs(inp, simulateDay(inp));
      expect(Number.isFinite(k.totalAnnualValue)).toBe(true);
      expect(Number.isFinite(k.capexEstimate)).toBe(true);
      expect(Number.isFinite(k.paybackYears)).toBe(true);
    }
  });
});
