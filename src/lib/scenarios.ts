import type { HourlyPoint, SimInputs } from "@/data/types";

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
