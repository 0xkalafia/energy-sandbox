import { useMemo } from "react";
import { useTheme } from "@/lib/theme";

/**
 * Single source of truth for chart colors.
 *
 * SERIES = vivid data-mark colors (kept as oklch constants — they read well on
 * both light and dark backgrounds, so they don't need to theme-switch).
 *
 * Axis / grid / tooltip-chrome colors DO need to follow the theme, so they're
 * resolved live from the CSS custom properties via `useChartTheme()`.
 */
export const SERIES = {
  solar: "oklch(0.83 0.17 75)", // amber
  wind: "oklch(0.78 0.14 235)", // sky
  biomass: "oklch(0.78 0.18 155)", // emerald
  hydro: "oklch(0.72 0.15 200)", // teal
  battery: "oklch(0.7 0.2 290)", // violet
  // semantic aliases (match the Badge tones)
  emerald: "oklch(0.78 0.18 155)",
  amber: "oklch(0.83 0.17 75)",
  rose: "oklch(0.72 0.2 20)",
  sky: "oklch(0.78 0.14 235)",
  violet: "oklch(0.7 0.2 290)",
} as const;

export type SeriesKey = keyof typeof SERIES;

// Fallbacks used during SSR / before getComputedStyle is available.
const FALLBACK = {
  axis: "oklch(0.5 0.01 270)",
  grid: "oklch(0.28 0.008 270)",
  borderStrong: "oklch(0.36 0.01 270)",
  fg: "oklch(0.96 0.005 270)",
};

export interface ChartTheme {
  axis: string;
  grid: string;
  borderStrong: string;
  fg: string;
  /** Spread onto <XAxis>/<YAxis> for consistent styling. */
  axisProps: {
    stroke: string;
    tick: { fontSize: number };
    tickLine: boolean;
    axisLine: boolean;
  };
  /** Spread onto <CartesianGrid>. */
  gridProps: {
    strokeDasharray: string;
    stroke: string;
    vertical: boolean;
  };
}

/**
 * Resolve themed chart chrome colors from the live CSS variables. Re-resolves
 * whenever the effective (light/dark) theme changes so axes/grid adapt.
 */
export function useChartTheme(): ChartTheme {
  const { effective } = useTheme();

  return useMemo(() => {
    let axis = FALLBACK.axis;
    let grid = FALLBACK.grid;
    let borderStrong = FALLBACK.borderStrong;
    let fg = FALLBACK.fg;

    if (typeof document !== "undefined") {
      const cs = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) =>
        cs.getPropertyValue(name).trim() || fallback;
      axis = read("--color-fg-subtle", FALLBACK.axis);
      grid = read("--color-border", FALLBACK.grid);
      borderStrong = read("--color-border-strong", FALLBACK.borderStrong);
      fg = read("--color-fg", FALLBACK.fg);
    }

    return {
      axis,
      grid,
      borderStrong,
      fg,
      axisProps: {
        stroke: axis,
        tick: { fontSize: 10 },
        tickLine: false,
        axisLine: false,
      },
      gridProps: {
        strokeDasharray: "3 3",
        stroke: grid,
        vertical: false,
      },
    };
    // effective is the dependency that signals a theme switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective]);
}
