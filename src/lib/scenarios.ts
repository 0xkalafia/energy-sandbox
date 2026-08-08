import type { HourlyPoint, SimInputs } from "@/data/types";
import { DEFAULT_INPUTS } from "@/data/constants";

const KEY = "phet-sim-scenarios";

export interface SavedScenario {
  name: string;
  inputs: SimInputs;
  savedAt: number;
}

export function listScenarios(): SavedScenario[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedScenario[];
    return Array.isArray(arr) ? arr.sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch {
    return [];
  }
}

function persist(list: SavedScenario[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Save (or overwrite by name). Returns the new list. */
export function saveScenario(name: string, inputs: SimInputs): SavedScenario[] {
  const list = listScenarios().filter((s) => s.name !== name);
  list.unshift({ name, inputs, savedAt: stamp() });
  persist(list);
  return list;
}

export function deleteScenario(name: string): SavedScenario[] {
  const list = listScenarios().filter((s) => s.name !== name);
  persist(list);
  return list;
}

// Date.now is unavailable in some sandboxed contexts (workflow scripts) but
// fine in the browser; guard just in case.
function stamp(): number {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

// ---------- Downloads ----------

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Keys that must stay inside 0..1 (fractions/shares). */
const FRACTION_KEYS = new Set([
  "methanolLocalShare",
  "batteryDoDFloor",
  "wwtCoverage",
]);
/** Round-trip efficiency: 0 would divide by zero in the dispatch loop. */
const EFFICIENCY_MIN = 0.01;
const VALID_SEASONS = new Set(["summer", "rainy", "winter", "monsoon"]);

/**
 * Parse an uploaded scenario .json file into SimInputs (merged over defaults,
 * so partial / older exports still load). Unknown keys are ignored.
 *
 * Every value is validated against the shape of DEFAULT_INPUTS: numbers must
 * be finite and non-negative, fractions are clamped to 0..1, and anything of
 * the wrong type falls back to the default. Without this a hand-edited file
 * could push e.g. `batteryRoundTrip: 0` into the engine and NaN every KPI.
 */
export function parseScenarioJSON(text: string): SimInputs {
  const obj = JSON.parse(text) as Record<string, unknown>;
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("scenario must be a JSON object");
  }

  const defaults = DEFAULT_INPUTS as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...defaults };

  for (const key of Object.keys(defaults)) {
    if (!(key in obj)) continue;
    const raw = obj[key];
    const def = defaults[key];

    if (typeof def === "number") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) continue; // keep the default
      if (FRACTION_KEYS.has(key)) out[key] = Math.min(1, Math.max(0, n));
      else if (key === "batteryRoundTrip")
        out[key] = Math.min(1, Math.max(EFFICIENCY_MIN, n));
      else out[key] = Math.max(0, n); // capacities/prices can't be negative
    } else if (typeof def === "boolean") {
      if (typeof raw === "boolean") out[key] = raw;
    } else if (key === "season") {
      if (typeof raw === "string" && VALID_SEASONS.has(raw)) out[key] = raw;
    }
  }

  return out as unknown as SimInputs;
}

export function downloadScenarioJSON(inputs: SimInputs, name = "scenario") {
  triggerDownload(
    `${slug(name)}.json`,
    JSON.stringify(inputs, null, 2),
    "application/json",
  );
}

/** Export the 24-hour hourly trace as CSV. */
export function downloadHourlyCSV(hourly: HourlyPoint[], name = "hourly") {
  if (hourly.length === 0) return;
  const cols = Object.keys(hourly[0]) as (keyof HourlyPoint)[];
  const header = cols.join(",");
  const lines = hourly.map((h) =>
    cols
      .map((c) => {
        const v = h[c];
        return typeof v === "number" ? round(v) : String(v);
      })
      .join(","),
  );
  triggerDownload(`${slug(name)}.csv`, [header, ...lines].join("\n"), "text/csv");
}

function round(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3);
}

function slug(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "scenario"
  );
}
