/**
 * The shading ramp all three maps share.
 *
 * There were three copies of this function and they had already drifted: two
 * maps opened at 0.12 and ran to 0.88, the third opened at 0.14 and ran to
 * 0.86, with nothing anywhere saying why. Nobody would have noticed, and a
 * fourth map would have been a coin toss over which one to copy.
 *
 * Kept apart from ChoroplethLegend so that file exports only a component —
 * mixing the two breaks fast refresh for everything that imports it.
 */

/** Palest and darkest the fill ever goes. */
export const RAMP_MIN = 0.12;
export const RAMP_SPAN = 0.76;

/**
 * Fill opacity for a value, anchored to the observed range rather than to
 * zero.
 *
 * From zero, the maps are unreadable. Measured on the province map, allocated
 * totals run 990 to 1,910 MW — every district between half and full, which is
 * eight near-identical shapes. Nationwide solar spans 0.151 to 0.176, which
 * from zero is 77 of them. Anchoring to min and max is what makes the shading
 * carry information, and it is also why every caller has to print the two
 * ends: without them the darkest patch means nothing in particular.
 */
export function ramp(value: number, min: number, max: number): number {
  const t = max - min < 1e-9 ? 0.5 : (value - min) / (max - min);
  return RAMP_MIN + RAMP_SPAN * t;
}
