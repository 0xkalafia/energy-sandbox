// Shared statistics helpers — used by the weather Monte Carlo and the
// financial Monte Carlo (previously duplicated in both engines).

/** Mulberry32 — small, fast, seedable PRNG. */
export function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller normal sample from a uniform rng. */
export function gaussian(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + sd * z;
}

/** Linear-interpolated percentile (p in 0..1) over a *sorted* array. */
export function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface Percentiles {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  mean: number;
}

export function percentiles(values: number[]): Percentiles {
  const s = [...values].sort((a, b) => a - b);
  return {
    p5: percentileSorted(s, 0.05),
    p25: percentileSorted(s, 0.25),
    p50: percentileSorted(s, 0.5),
    p75: percentileSorted(s, 0.75),
    p95: percentileSorted(s, 0.95),
    mean: values.reduce((a, b) => a + b, 0) / (values.length || 1),
  };
}

export interface Bin {
  lo: number;
  hi: number;
  count: number;
}

/** Bucket values into `bins` equal-width bins over [min,max] (or `range`). */
export function histogram(
  values: number[],
  bins: number,
  range?: [number, number],
): Bin[] {
  if (values.length === 0) return [];
  const min = range ? range[0] : Math.min(...values);
  const max = range ? range[1] : Math.max(...values);
  if (min === max) return [{ lo: min, hi: max, count: values.length }];
  const w = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / w);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  }
  return counts.map((count, i) => ({
    lo: min + i * w,
    hi: min + (i + 1) * w,
    count,
  }));
}
