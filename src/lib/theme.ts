import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "phet-sim-theme";

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode: ThemeMode) {
  const effective: "light" | "dark" =
    mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
  document.documentElement.setAttribute("data-theme", effective);
  document.documentElement.style.colorScheme = effective;
}

/**
 * Stamp `data-theme` before React renders anything.
 *
 * Doing it in an effect is a render too late, and charts pay for it: the CSS
 * variables still hold the `:root` defaults (dark) during the first pass, so
 * `useChartTheme` samples dark axis and accent colours and paints them onto a
 * light page. Measured on a fresh light-mode load: axis ticks at 3.58:1 and
 * the DoD-floor caption at 2.83:1, on the first tab only, because every later
 * tab mounts after the attribute lands. Anything already rendered keeps the
 * wrong colours until something re-renders it.
 */
if (typeof document !== "undefined") applyTheme(readStored());

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored());

  // Re-apply on change; the first pass already happened at module load.
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  // Listen for system changes when mode == "system"
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setMode = (m: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, m);
    setModeState(m);
  };

  const cycle = () => {
    setMode(mode === "dark" ? "light" : mode === "light" ? "system" : "dark");
  };

  const effective: "light" | "dark" =
    mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;

  return { mode, setMode, cycle, effective };
}
