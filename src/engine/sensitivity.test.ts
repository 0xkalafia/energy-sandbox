import { describe, it, expect } from "vitest";
import { computeSensitivity, METRIC_META } from "./sensitivity";
import { computeKPIs, simulateDay } from "./simulate";
import { DEFAULT_INPUTS } from "@/data/constants";
import type { SimInputs } from "@/data/types";

/**
 * The tornado's whole job is to answer "which input moves the number most",
 * and the app reads that answer straight off `rows[0]` for the "biggest lever"
 * card. So the ordering is the thing under test, not the individual numbers:
 * a comparator with its operands the wrong way round produces a chart that
 * looks entirely normal and says the opposite of the truth.
 */

const base = (over: Partial<SimInputs> = {}): SimInputs => ({
  ...DEFAULT_INPUTS,
  ...over,
});

describe("row ordering", () => {
  it("sorts by swing, largest first", () => {
    const { rows } = computeSensitivity(base(), "payback");
    expect(rows.length).toBeGreaterThan(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].swing).toBeGreaterThanOrEqual(rows[i].swing);
    }
  });

  it("puts a genuinely dominant input on top", () => {
    // Not a tautology against the sort: methanol output drives both the
    // biggest cost and the biggest revenue in this scenario, so it should win
    // on annual value regardless of how the rows happen to be ordered.
    const { rows } = computeSensitivity(base(), "annualValue");
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.swing]));
    expect(byKey.methanolKtPerYear).toBeGreaterThan(byKey.biomassMW);
    expect(rows[0].swing).toBe(Math.max(...rows.map((r) => r.swing)));
  });

  it("agrees with the swing recomputed from scratch", () => {
    // Recomputed the long way, without touching the module under test, so a
    // sign error or a dropped Math.abs cannot pass.
    const inputs = base();
    const { rows } = computeSensitivity(inputs, "annualValue", 0.2);
    const get = METRIC_META.annualValue.get;
    for (const row of rows.slice(0, 4)) {
      const v = inputs[row.key] as number;
      const at = (f: number) => {
        const next = { ...inputs, [row.key]: v * f };
        return get(computeKPIs(next, simulateDay(next)));
      };
      expect(row.low).toBeCloseTo(at(0.8), 6);
      expect(row.high).toBeCloseTo(at(1.2), 6);
      expect(row.swing).toBeCloseTo(Math.abs(at(1.2) - at(0.8)), 6);
    }
  });

  it("keeps swing non-negative whichever way the metric moves", () => {
    // Both directions occur in the same chart, which is exactly why the swing
    // is an absolute value: a higher methanol price is pure revenue and pulls
    // payback down, while more solar is CAPEX that earns back slowly and
    // pushes it *up* — the plan is already past the point where extra panels
    // pay for themselves. Without Math.abs the falling ones would sort to the
    // bottom with negative swings and the tornado would read backwards.
    const { rows } = computeSensitivity(base(), "payback");
    expect(rows.every((r) => r.swing >= 0)).toBe(true);

    const price = rows.find((r) => r.key === "methanolPrice")!;
    expect(price.high).toBeLessThan(price.low);
    expect(price.swing).toBeGreaterThan(0);

    const solar = rows.find((r) => r.key === "solarMW")!;
    expect(solar.high).toBeGreaterThan(solar.low);
    expect(solar.swing).toBeGreaterThan(0);
  });
});

describe("which inputs get a row", () => {
  it("skips inputs sitting at zero — sweeping ±20% of nothing is nothing", () => {
    const { rows } = computeSensitivity(base({ biomassMW: 0 }), "payback");
    expect(rows.some((r) => r.key === "biomassMW")).toBe(false);
    expect(rows.some((r) => r.key === "solarMW")).toBe(true);
  });

  it("never emits a row for a non-numeric input", () => {
    const { rows } = computeSensitivity(base(), "payback");
    for (const r of rows) {
      expect(typeof DEFAULT_INPUTS[r.key]).toBe("number");
    }
  });

  it("labels every row", () => {
    const { rows } = computeSensitivity(base(), "payback");
    expect(rows.every((r) => r.label.length > 0)).toBe(true);
    expect(new Set(rows.map((r) => r.label)).size).toBe(rows.length);
  });

  it("returns rows even when most modules are switched off", () => {
    const { rows } = computeSensitivity(
      base({
        dacOn: false,
        methanolOn: false,
        dataCenterOn: false,
        desalOn: false,
        wasteOn: false,
        wwtOn: false,
      }),
      "payback",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Number.isFinite(r.swing))).toBe(true);
  });
});

describe("the baseline", () => {
  it("matches the metric computed directly on the untouched inputs", () => {
    const inputs = base();
    const expected = METRIC_META.payback.get(
      computeKPIs(inputs, simulateDay(inputs)),
    );
    expect(computeSensitivity(inputs, "payback").base).toBeCloseTo(expected, 10);
  });

  it("is repeated identically on every row", () => {
    const { base: b, rows } = computeSensitivity(base(), "netCarbon");
    expect(rows.every((r) => r.base === b)).toBe(true);
  });
});

describe("the sweep width is honoured", () => {
  it("collapses every swing to zero at pct = 0", () => {
    const { base: b, rows } = computeSensitivity(base(), "annualValue", 0);
    for (const r of rows) {
      expect(r.low).toBeCloseTo(b, 10);
      expect(r.high).toBeCloseTo(b, 10);
      expect(r.swing).toBeCloseTo(0, 10);
    }
  });

  it("widens the swing as pct grows", () => {
    const narrow = computeSensitivity(base(), "annualValue", 0.1);
    const wide = computeSensitivity(base(), "annualValue", 0.3);
    const n = Object.fromEntries(narrow.rows.map((r) => [r.key, r.swing]));
    const w = Object.fromEntries(wide.rows.map((r) => [r.key, r.swing]));
    for (const key of Object.keys(n)) {
      if (n[key] > 1e-9) expect(w[key]).toBeGreaterThan(n[key]);
    }
  });

  it("defaults to ±20%", () => {
    const explicit = computeSensitivity(base(), "payback", 0.2);
    const implicit = computeSensitivity(base(), "payback");
    expect(implicit.rows.map((r) => r.swing)).toEqual(
      explicit.rows.map((r) => r.swing),
    );
  });
});

describe("METRIC_META", () => {
  it("reads each metric off the right KPI, in the right unit", () => {
    const k = computeKPIs(DEFAULT_INPUTS, simulateDay(DEFAULT_INPUTS));
    expect(METRIC_META.payback.get(k)).toBe(k.paybackYears);
    expect(METRIC_META.annualValue.get(k)).toBeCloseTo(k.totalAnnualValue / 1e9, 10);
    expect(METRIC_META.netCarbon.get(k)).toBeCloseTo(k.netCarbonTon / 1e3, 10);
  });

  it("marks payback and carbon as lower-is-better, value as higher", () => {
    // The chart colours bars off this; inverting it recommends the opposite.
    expect(METRIC_META.payback.lowerIsBetter).toBe(true);
    expect(METRIC_META.netCarbon.lowerIsBetter).toBe(true);
    expect(METRIC_META.annualValue.lowerIsBetter).toBe(false);
  });

  it("gives every metric a label and a unit", () => {
    for (const m of Object.values(METRIC_META)) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.unit.length).toBeGreaterThan(0);
    }
  });
});
