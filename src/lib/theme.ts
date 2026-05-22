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

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored());

  // Apply on first render
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
