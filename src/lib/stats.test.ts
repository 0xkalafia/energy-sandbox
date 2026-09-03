import { describe, it, expect } from "vitest";
import {
  makeRng,
  gaussian,
  percentileSorted,
  percentiles,
  histogram,
} from "./stats";

/**
 * These back both Monte Carlos, so a quiet arithmetic slip here shows up as a
 * plausible-looking distribution rather than an error. Tests aim at the seams
 * — the clamps, the empty cases, the interpolation between two samples — not
 * at round numbers in the middle where almost any formula gives the right
 * answer.
 */

describe("makeRng", () => {
  it("is reproducible: same seed, same sequence", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 20 }, a);
    const seqB = Array.from({ length: 20 }, b);
    expect(seqA).toEqual(seqB);
  });

  it("gives different sequences for different seeds", () => {
    const a = Array.from({ length: 10 }, makeRng(1));
    const b = Array.from({ length: 10 }, makeRng(2));
    expect(a).not.toEqual(b);
  });

  it("does not repeat itself immediately", () => {
    const r = makeRng(7);
    const draws = Array.from({ length: 500 }, r);
    expect(new Set(draws).size).toBe(500);
  });

  it("stays in [0, 1)", () => {
    const r = makeRng(12345);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("covers the unit interval rather than clustering", () => {
    const r = makeRng(99);
    const draws = Array.from({ length: 4000 }, r);
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    // every decile touched
    const deciles = new Set(draws.map((d) => Math.floor(d * 10)));
    expect(deciles.size).toBe(10);
  });

  it("seed 0 still produces a live generator", () => {
    const r = makeRng(0);
    const draws = Array.from({ length: 5 }, r);
    expect(new Set(draws).size).toBe(5);
    expect(draws.every((d) => d >= 0 && d < 1)).toBe(true);
  });
});

describe("gaussian", () => {
  // A stub rng makes Box–Muller exactly checkable instead of statistical.
  const feed = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  it("matches Box–Muller for known uniforms", () => {
    const u = 0.25;
    const v = 0.5;
    const expected = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    expect(gaussian(feed(u, v), 0, 1)).toBeCloseTo(expected, 12);
  });

  it("shifts by mean and scales by sd", () => {
    const z = gaussian(feed(0.25, 0.5), 0, 1);
    expect(gaussian(feed(0.25, 0.5), 10, 3)).toBeCloseTo(10 + 3 * z, 12);
  });

  it("sd = 0 collapses onto the mean", () => {
    expect(gaussian(feed(0.25, 0.5), 5, 0)).toBe(5);
  });

  it("survives an rng returning exactly 0 — log(0) would be -Infinity", () => {
    // The 1e-9 floor exists for this. Without it the result is NaN/Infinity
    // and the whole Monte Carlo silently fills with garbage.
    const out = gaussian(feed(0, 0.5), 0, 1);
    expect(Number.isFinite(out)).toBe(true);
  });

  it("is symmetric about the mean over many draws", () => {
    const r = makeRng(3);
    const draws = Array.from({ length: 4000 }, () => gaussian(r, 100, 15));
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    const sd = Math.sqrt(
      draws.reduce((a, b) => a + (b - mean) ** 2, 0) / draws.length,
    );
    expect(mean).toBeGreaterThan(99);
    expect(mean).toBeLessThan(101);
    expect(sd).toBeGreaterThan(14);
    expect(sd).toBeLessThan(16);
  });
});

describe("percentileSorted", () => {
  const s = [10, 20, 30, 40, 50];

  it("returns 0 for an empty array", () => {
    expect(percentileSorted([], 0.5)).toBe(0);
  });

  it("returns the only value for a single-element array at any p", () => {
    expect(percentileSorted([7], 0)).toBe(7);
    expect(percentileSorted([7], 0.5)).toBe(7);
    expect(percentileSorted([7], 1)).toBe(7);
  });

  it("hits the ends exactly", () => {
    expect(percentileSorted(s, 0)).toBe(10);
    expect(percentileSorted(s, 1)).toBe(50);
  });

  it("lands on an exact index without interpolating", () => {
    expect(percentileSorted(s, 0.5)).toBe(30); // idx = 2 exactly
    expect(percentileSorted(s, 0.25)).toBe(20); // idx = 1 exactly
  });

  it("interpolates between neighbours — the seam that matters", () => {
    // idx = (5-1) * 0.3 = 1.2 → 20 + (30-20)*0.2 = 22
    expect(percentileSorted(s, 0.3)).toBeCloseTo(22, 10);
    // idx = 4 * 0.875 = 3.5 → halfway between 40 and 50
    expect(percentileSorted(s, 0.875)).toBeCloseTo(45, 10);
  });

  it("interpolates on an even-length array, where no index is the middle", () => {
    // idx = (4-1) * 0.5 = 1.5 → halfway between 20 and 30
    expect(percentileSorted([10, 20, 30, 40], 0.5)).toBeCloseTo(25, 10);
  });
});

describe("percentiles", () => {
  it("sorts unsorted input", () => {
    const p = percentiles([50, 10, 40, 20, 30]);
    expect(p.p50).toBe(30);
    expect(p.p5).toBeCloseTo(12, 10);
    expect(p.p95).toBeCloseTo(48, 10);
  });

  it("leaves the caller's array untouched", () => {
    // The copy in `[...values].sort()` is easy to drop by accident, and the
    // damage — a caller's array quietly reordered — would surface far away.
    const input = [3, 1, 2];
    percentiles(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it("orders the quantiles", () => {
    const p = percentiles(Array.from({ length: 100 }, (_, i) => i));
    expect(p.p5).toBeLessThan(p.p25);
    expect(p.p25).toBeLessThan(p.p50);
    expect(p.p50).toBeLessThan(p.p75);
    expect(p.p75).toBeLessThan(p.p95);
  });

  it("means over the original values", () => {
    expect(percentiles([1, 2, 3, 4]).mean).toBeCloseTo(2.5, 10);
  });

  it("returns 0 rather than NaN for an empty input", () => {
    // `|| 1` on the divisor: without it the mean is 0/0.
    const p = percentiles([]);
    expect(p.mean).toBe(0);
    expect(p.p50).toBe(0);
  });
});

describe("histogram", () => {
  it("returns nothing for no values", () => {
    expect(histogram([], 5)).toEqual([]);
  });

  it("collapses to one bin when every value is identical", () => {
    const h = histogram([4, 4, 4], 5);
    expect(h).toEqual([{ lo: 4, hi: 4, count: 3 }]);
  });

  it("splits an even spread across bins with the right edges", () => {
    const h = histogram([0, 1, 2, 3], 4, [0, 4]);
    expect(h.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(h[0]).toMatchObject({ lo: 0, hi: 1 });
    expect(h[3]).toMatchObject({ lo: 3, hi: 4 });
  });

  it("puts a value sitting exactly on the top edge in the last bin", () => {
    // (max-min)/w lands on `bins`, one past the end. The `idx >= bins` clamp
    // is the only thing stopping an undefined slot.
    const h = histogram([10], 4, [0, 10]);
    expect(h[3].count).toBe(1);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(1);
  });

  it("clamps values below the range into the first bin", () => {
    const h = histogram([-5], 4, [0, 10]);
    expect(h[0].count).toBe(1);
  });

  it("clamps values above the range into the last bin", () => {
    const h = histogram([999], 4, [0, 10]);
    expect(h[3].count).toBe(1);
  });

  it("keeps every value when no range is given", () => {
    const values = Array.from({ length: 200 }, (_, i) => i * 0.37);
    const h = histogram(values, 12);
    expect(h).toHaveLength(12);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(values.length);
  });

  it("uses the requested bin count, not the value count", () => {
    expect(histogram([1, 2, 3], 7)).toHaveLength(7);
  });

  it("makes bins contiguous — each hi is the next lo", () => {
    const h = histogram([0, 5, 10], 5, [0, 10]);
    for (let i = 1; i < h.length; i++) {
      expect(h[i].lo).toBeCloseTo(h[i - 1].hi, 10);
    }
  });
});
