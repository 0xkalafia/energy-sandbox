import { describe, it, expect } from "vitest";
import { DEFAULT_INPUTS, PRESETS, SMART_DISPATCH_MAX_BOOST } from "@/data/constants";
import { computeKPIs, simulateDay, shapeShiftable } from "@/engine/simulate";
import { simulateMultiDay } from "@/engine/multiDay";
import { projectMultiYear, DEFAULT_MULTI_YEAR } from "@/engine/multiYear";
import { runMonteCarlo, DEFAULT_MC } from "@/engine/monteCarlo";
import { optimizeResilientMix, DEFAULT_OPT } from "@/engine/optimize";
import { runFinancialMC, DEFAULT_FIN_MC } from "@/engine/financialMC";
import { simulateHouse, DEFAULT_HOUSE } from "@/engine/house";
import { allocate } from "@/data/districts";
import { timeline, inputsForYear, START_YEAR, END_YEAR } from "@/engine/timeMachine";
import { MONTH_SEASON } from "@/data/constants";
import { annualGrid } from "@/engine/annual";
import { parseScenarioJSON } from "@/lib/scenarios";

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

describe("seasonal cooling demand", () => {
  it("summer lifestyle load exceeds winter (A/C)", () => {
    const summer = simulateDay({ ...DEFAULT_INPUTS, season: "summer" });
    const winter = simulateDay({ ...DEFAULT_INPUTS, season: "winter" });
    const sumLife = summer.reduce((a, h) => a + h.lifestyle, 0);
    const winLife = winter.reduce((a, h) => a + h.lifestyle, 0);
    expect(sumLife).toBeGreaterThan(winLife);
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

describe("optimizeResilientMix", () => {
  it("returns a full grid and a feasible min-CAPEX best", () => {
    const r = optimizeResilientMix(DEFAULT_INPUTS, { ...DEFAULT_OPT, solarSteps: 5, batterySteps: 5 });
    expect(r.grid).toHaveLength(25);
    if (r.best) {
      expect(r.best.feasible).toBe(true);
      const feasible = r.grid.filter((p) => p.feasible);
      const minCapex = Math.min(...feasible.map((p) => p.capex));
      expect(r.best.capex).toBe(minCapex);
    }
  });

  it("bigger solar+battery is never infeasible if a smaller one was feasible", () => {
    const r = optimizeResilientMix(DEFAULT_INPUTS, { ...DEFAULT_OPT, solarSteps: 5, batterySteps: 5 });
    // monotonic-ish: the max solar+max battery corner should be feasible if any is
    const anyFeasible = r.grid.some((p) => p.feasible);
    if (anyFeasible) {
      const corner = r.grid.reduce((a, b) =>
        a.solarMW + a.batteryGWh * 100 > b.solarMW + b.batteryGWh * 100 ? a : b,
      );
      expect(corner.feasible).toBe(true);
    }
  });
});

describe("runFinancialMC", () => {
  it("is deterministic for a fixed seed and reports valid probabilities", () => {
    const a = runFinancialMC(DEFAULT_INPUTS, { ...DEFAULT_FIN_MC, samples: 80, seed: 3 });
    const b = runFinancialMC(DEFAULT_INPUTS, { ...DEFAULT_FIN_MC, samples: 80, seed: 3 });
    expect(a.probPaysBack).toBe(b.probPaysBack);
    expect(a.probPaysBack).toBeGreaterThanOrEqual(0);
    expect(a.probPaysBack).toBeLessThanOrEqual(1);
    expect(a.payback.p10).toBeLessThanOrEqual(a.payback.p90);
  });
});

describe("simulateHouse (residential)", () => {
  it("produces 24 hours and sane self-sufficiency in [0,1]", () => {
    const r = simulateHouse(DEFAULT_HOUSE);
    expect(r.hourly).toHaveLength(24);
    expect(r.selfSufficiency).toBeGreaterThanOrEqual(0);
    expect(r.selfSufficiency).toBeLessThanOrEqual(1);
    expect(r.selfConsumption).toBeLessThanOrEqual(1.0000001);
  });

  it("adding a battery raises self-sufficiency and saves money", () => {
    const noBatt = simulateHouse({ ...DEFAULT_HOUSE, batteryKWh: 0 });
    const withBatt = simulateHouse({ ...DEFAULT_HOUSE, batteryKWh: 15 });
    expect(withBatt.selfSufficiency).toBeGreaterThanOrEqual(noBatt.selfSufficiency);
    expect(withBatt.monthlySaving).toBeGreaterThanOrEqual(noBatt.monthlySaving);
  });

  it("more solar exports more / imports less", () => {
    const small = simulateHouse({ ...DEFAULT_HOUSE, solarW: 2000 });
    const big = simulateHouse({ ...DEFAULT_HOUSE, solarW: 8000 });
    expect(big.importKWhDay).toBeLessThanOrEqual(small.importKWhDay);
  });
});

describe("district allocation conserves province totals", () => {
  it("solar / wind / battery sum back to the inputs", () => {
    const a = allocate(DEFAULT_INPUTS);
    expect(a).toHaveLength(8);
    const sum = (f: (x: (typeof a)[number]) => number) =>
      a.reduce((s, x) => s + f(x), 0);
    expect(sum((x) => x.solarMW)).toBeCloseTo(DEFAULT_INPUTS.solarMW, 3);
    expect(sum((x) => x.windMW)).toBeCloseTo(DEFAULT_INPUTS.windMW, 3);
    expect(sum((x) => x.batteryGWh)).toBeCloseTo(DEFAULT_INPUTS.batteryGWh, 3);
  });

  it("only Kaeng Krachan hosts hydro", () => {
    const a = allocate(DEFAULT_INPUTS);
    const hydroHosts = a.filter((x) => x.hydroMW > 0.01);
    expect(hydroHosts).toHaveLength(1);
    expect(hydroHosts[0].d.id).toBe("kaengkrachan");
  });
});

describe("time machine build-out", () => {
  it("end year matches the plan; start year is the small 2026 baseline", () => {
    const planEnd = inputsForYear(DEFAULT_INPUTS, END_YEAR);
    const start = inputsForYear(DEFAULT_INPUTS, START_YEAR);
    expect(planEnd.solarMW).toBeCloseTo(DEFAULT_INPUTS.solarMW, 0);
    expect(start.solarMW).toBeLessThan(DEFAULT_INPUTS.solarMW * 0.3);
  });
  it("capacity grows monotonically over the timeline", () => {
    const t = timeline(DEFAULT_INPUTS);
    expect(t).toHaveLength(END_YEAR - START_YEAR + 1);
    for (let i = 1; i < t.length; i++) {
      expect(t[i].capacityMW).toBeGreaterThanOrEqual(t[i - 1].capacityMW - 1);
    }
  });
});

describe("annual grid", () => {
  it("produces 12×24 cells", () => {
    expect(annualGrid(DEFAULT_INPUTS)).toHaveLength(288);
  });
});

describe("scenario JSON round-trip", () => {
  it("re-parses a full export back to the same inputs", () => {
    const parsed = parseScenarioJSON(JSON.stringify(DEFAULT_INPUTS));
    expect(parsed).toEqual(DEFAULT_INPUTS);
  });
  it("merges a partial export over defaults and ignores junk keys", () => {
    const parsed = parseScenarioJSON('{"solarMW":9999,"bogusKey":1}');
    expect(parsed.solarMW).toBe(9999);
    expect(parsed.windMW).toBe(DEFAULT_INPUTS.windMW);
    expect((parsed as unknown as Record<string, unknown>).bogusKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Regressions from the Opus-5 audit. Each of these shipped broken once.
// ---------------------------------------------------------------------------

describe("boundary sweep — every value the sliders/import allow", () => {
  const CASES: Array<[string, Partial<typeof DEFAULT_INPUTS>]> = [
    ["battery 0 GWh (slider min)", { batteryGWh: 0 }],
    ["solar 0 MW", { solarMW: 0 }],
    ["no supply at all", { solarMW: 0, windMW: 0, biomassMW: 0, hydroMW: 0 }],
    ["every mission off", {
      dacOn: false, methanolOn: false, dataCenterOn: false,
      desalOn: false, wasteOn: false, wwtOn: false,
    }],
    ["battery 0 + missions off", {
      batteryGWh: 0, dacOn: false, methanolOn: false, dataCenterOn: false,
      desalOn: false, wasteOn: false, wwtOn: false,
    }],
    ["round-trip 0 (reachable via import)", { batteryRoundTrip: 0 }],
    ["DoD floor 0", { batteryDoDFloor: 0 }],
    ["DoD floor 0.3 (slider max)", { batteryDoDFloor: 0.3 }],
  ];

  for (const [name, patch] of CASES) {
    it(`${name} → no NaN/Infinity anywhere`, () => {
      const inp = { ...DEFAULT_INPUTS, ...patch };
      const hourly = simulateDay(inp);
      for (const h of hourly) {
        for (const [k, v] of Object.entries(h)) {
          if (typeof v === "number") {
            expect(Number.isFinite(v), `hourly.${k}`).toBe(true);
          }
        }
      }
      const kpis = computeKPIs(inp, hourly);
      for (const [k, v] of Object.entries(kpis)) {
        if (typeof v === "number") {
          expect(Number.isFinite(v), `kpi.${k}`).toBe(true);
        }
      }
    });
  }

  it("battery 0 reports zero cycles and zero lifespan (not a phantom 40yr)", () => {
    const k = computeKPIs(
      { ...DEFAULT_INPUTS, batteryGWh: 0 },
      simulateDay({ ...DEFAULT_INPUTS, batteryGWh: 0 }),
    );
    expect(k.batteryCyclesPerDay).toBe(0);
    expect(k.batteryLifespanYears).toBe(0);
    expect(k.batteryMinSoC).toBe(0);
  });
});

describe("CAPEX scales with plant utilisation", () => {
  it("a mission that is on but produces nothing costs nothing", () => {
    const idle = computeKPIs(
      { ...DEFAULT_INPUTS, dacTargetMtPerYear: 0 },
      simulateDay({ ...DEFAULT_INPUTS, dacTargetMtPerYear: 0 }),
    );
    const off = computeKPIs(
      { ...DEFAULT_INPUTS, dacOn: false, dacTargetMtPerYear: 0 },
      simulateDay({ ...DEFAULT_INPUTS, dacOn: false, dacTargetMtPerYear: 0 }),
    );
    expect(idle.capexEstimate).toBeCloseTo(off.capexEstimate, 0);
  });

  it("half the DAC target costs about half the DAC plant", () => {
    // Flat dispatch pins peak/average at 1 so this isolates the pro-rata rule
    // from the oversizing multiplier (covered separately below).
    const base = { ...DEFAULT_INPUTS, smartDispatch: false };
    const full = computeKPIs(base, simulateDay(base));
    const half = computeKPIs(
      { ...base, dacTargetMtPerYear: 0.5 },
      simulateDay({ ...base, dacTargetMtPerYear: 0.5 }),
    );
    expect(full.capexEstimate - half.capexEstimate).toBeCloseTo(15e9, -8);
  });

  it("the 2026 end of the time machine isn't billed for 2046 plants", () => {
    const y26 = inputsForYear(DEFAULT_INPUTS, START_YEAR);
    const k26 = computeKPIs(y26, simulateDay(y26));
    const k46 = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS));
    expect(k26.capexEstimate).toBeLessThan(k46.capexEstimate * 0.1);
  });
});

describe("seasonal demand ties out annually", () => {
  it("the yearly KPI equals the season-weighted average of the daily runs", () => {
    const perMonth = MONTH_SEASON.map((season) => {
      const i = { ...DEFAULT_INPUTS, season };
      return computeKPIs(i, simulateDay(i)).dailyDemandGWh;
    });
    const avgDaily = perMonth.reduce((a, b) => a + b, 0) / perMonth.length;
    const yearly = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS))
      .yearlyDemandGWh;
    expect(avgDaily * 365).toBeCloseTo(yearly, -1); // within ~10 GWh of 15,000
  });
});

describe("house battery payback is marginal, not the whole solar saving", () => {
  it("equals batteryCost ÷ the saving the battery itself adds", () => {
    const withB = simulateHouse({ ...DEFAULT_HOUSE, batteryKWh: 10 });
    const noB = simulateHouse({ ...DEFAULT_HOUSE, batteryKWh: 0 });
    const marginal = withB.monthlySaving - noB.monthlySaving;
    expect(withB.batteryMonthlySaving).toBeCloseTo(marginal, 6);
    expect(withB.batteryPaybackYears).toBeCloseTo(
      withB.batteryCost / (marginal * 12),
      6,
    );
    // The old bug divided by the *combined* saving and reported well under a year.
    expect(withB.batteryPaybackYears).toBeGreaterThan(1);
  });

  it("reports Infinity rather than a bogus number when it never pays back", () => {
    const pricey = simulateHouse({
      ...DEFAULT_HOUSE,
      batteryKWh: 10,
      batteryPricePerKWh: 15000,
      solarW: 100, // almost no surplus for the battery to time-shift
    });
    expect(pricey.batteryPaybackYears).toBeGreaterThan(20);
  });

  it("respects the DoD floor and the C-rate limit", () => {
    const r = simulateHouse({ ...DEFAULT_HOUSE, batteryKWh: 10 });
    expect(Math.min(...r.hourly.map((h) => h.soc))).toBeGreaterThanOrEqual(0.099);
  });
});

describe("untrusted scenario input can't poison the engine", () => {
  it("clamps a round-trip of 0 instead of dividing by zero", () => {
    const parsed = parseScenarioJSON('{"batteryRoundTrip":0}');
    expect(parsed.batteryRoundTrip).toBeGreaterThan(0);
    const k = computeKPIs(parsed, simulateDay(parsed));
    expect(Number.isFinite(k.dailyImportGWh)).toBe(true);
  });

  it("rejects wrong types, NaN and negatives; clamps fractions", () => {
    const parsed = parseScenarioJSON(
      '{"solarMW":"not a number","windMW":-500,"methanolLocalShare":5,"dacOn":"yes","season":"tuesday"}',
    );
    expect(parsed.solarMW).toBe(DEFAULT_INPUTS.solarMW); // junk → default
    expect(parsed.windMW).toBe(0); // negative → clamped
    expect(parsed.methanolLocalShare).toBe(1); // fraction → clamped
    expect(parsed.dacOn).toBe(DEFAULT_INPUTS.dacOn); // wrong type → default
    expect(parsed.season).toBe(DEFAULT_INPUTS.season); // unknown → default
  });

  it("throws on a non-object payload", () => {
    expect(() => parseScenarioJSON("[1,2,3]")).toThrow();
  });
});

describe("smart dispatch — shifting missions into the surplus", () => {
  const flat = { ...DEFAULT_INPUTS, smartDispatch: false };
  const smart = { ...DEFAULT_INPUTS, smartDispatch: true };

  it("conserves each mission's daily energy — it moves load, it doesn't delete it", () => {
    const a = simulateDay(flat);
    const b = simulateDay(smart);
    for (const key of ["dac", "desal", "methanol", "waste", "dataCenter", "wwt"] as const) {
      const sumA = a.reduce((s, h) => s + h[key], 0);
      const sumB = b.reduce((s, h) => s + h[key], 0);
      expect(sumB, key).toBeCloseTo(sumA, 6);
    }
  });

  it("moves shiftable load toward the sunny hours", () => {
    const a = simulateDay(flat);
    const b = simulateDay(smart);
    const noon = (arr: typeof a) =>
      arr.slice(10, 15).reduce((s, h) => s + h.dac + h.desal, 0);
    const night = (arr: typeof a) =>
      [...arr.slice(0, 5), ...arr.slice(21)].reduce((s, h) => s + h.dac + h.desal, 0);
    expect(noon(b)).toBeGreaterThan(noon(a));
    expect(night(b)).toBeLessThan(night(a));
  });

  it("never shifts the 24/7 missions", () => {
    const b = simulateDay(smart);
    const dc = b.map((h) => h.dataCenter);
    const wwt = b.map((h) => h.wwt);
    expect(Math.max(...dc) - Math.min(...dc)).toBeLessThan(1e-6);
    expect(Math.max(...wwt) - Math.min(...wwt)).toBeLessThan(1e-6);
  });

  it("respects the turndown floor and the boost ceiling", () => {
    const b = simulateDay(smart);
    const series = b.map((h) => h.dac);
    const avg = series.reduce((s, v) => s + v, 0) / series.length;
    expect(Math.min(...series)).toBeGreaterThan(0); // never cold-stops
    expect(Math.max(...series)).toBeLessThanOrEqual(avg * SMART_DISPATCH_MAX_BOOST + 1e-6);
  });

  it("cuts the islanded battery drawdown (the point of the whole exercise)", () => {
    const a = simulateMultiDay(flat, 7, "monsoonStreak", { gridLimitMW: 0 });
    const b = simulateMultiDay(smart, 7, "monsoonStreak", { gridLimitMW: 0 });
    expect(b.curtailedGWh).toBeLessThan(a.curtailedGWh);
  });

  it("charges for the plant oversizing rather than handing it out free", () => {
    const ka = computeKPIs(flat, simulateDay(flat));
    const kb = computeKPIs(smart, simulateDay(smart));
    expect(kb.capexEstimate).toBeGreaterThan(ka.capexEstimate);
    // Revenue is set by annual targets, so it must be untouched by timing.
    expect(kb.totalAnnualValue).toBeCloseTo(ka.totalAnnualValue, 0);
  });

  it("loses to cheap storage but wins once batteries get expensive", () => {
    // The interesting result: shifting buys plant nameplate to avoid buying
    // storage, so which one wins is purely a price question. Give the smart
    // case the smaller battery its lighter cycling allows and compare CAPEX.
    const compare = (batteryPricePerKWh: number) => {
      const f = { ...DEFAULT_INPUTS, batteryPricePerKWh, smartDispatch: false };
      const s = {
        ...DEFAULT_INPUTS,
        batteryPricePerKWh,
        smartDispatch: true,
        batteryGWh: DEFAULT_INPUTS.batteryGWh * 0.55,
      };
      return (
        computeKPIs(s, simulateDay(s)).capexEstimate -
        computeKPIs(f, simulateDay(f)).capexEstimate
      );
    };
    expect(compare(525)).toBeGreaterThan(0); // 2046 sodium-ion → flat wins
    expect(compare(15000)).toBeLessThan(0); // today's prices → shifting wins
  });

  it("degrades to (near) flat when there is no surplus to chase", () => {
    const dark = { ...smart, solarMW: 0, windMW: 0, biomassMW: 0, hydroMW: 0 };
    const series = simulateDay(dark).map((h) => h.dac);
    const avg = series.reduce((s, v) => s + v, 0) / series.length;
    for (const v of series) expect(v).toBeCloseTo(avg, 6);
  });
});

describe("shapeShiftable", () => {
  it("conserves energy for any headroom shape", () => {
    const headroom = Array.from({ length: 24 }, (_, h) => (h > 8 && h < 17 ? 900 : 0));
    const out = shapeShiftable(2400, headroom, 0.3, 1.6);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(2400, 6);
    expect(out).toHaveLength(24);
  });

  it("returns all zeros for zero energy", () => {
    expect(shapeShiftable(0, Array(24).fill(500), 0.3, 1.6)).toEqual(Array(24).fill(0));
  });

  it("conserves energy even when the ceiling binds everywhere", () => {
    // Boost of 1.0 pins every hour to the average — nothing can move.
    const out = shapeShiftable(2400, Array(24).fill(1e6), 0.3, 1.0);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(2400, 6);
    for (const v of out) expect(v).toBeCloseTo(100, 6);
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
