/**
 * Per-province resource data: solar, wind, and whether the province has a coast.
 *
 *   node scripts/fetch-province-attributes.mjs
 *
 * Writes src/data/geo/attributes.ts. Cached in .geocache/ like the boundaries,
 * so a re-run costs nothing and a partial run resumes.
 *
 * Solar comes from PVGIS (EU JRC) as PV output per kWp, which is a capacity
 * factor directly rather than an irradiance figure needing assumptions bolted
 * on. Wind comes from NASA POWER as a climatological mean speed at 50 m.
 * Both are free and unauthenticated; both are sampled at the province's own
 * centre, which is a real limitation for the big provinces — Chiang Mai spans
 * 22,000 km² of mountain and valley and one point cannot speak for all of it.
 *
 * Monthly figures are kept, not just annual, because the model runs by season
 * and the seasonal spread is the interesting part: a province whose solar
 * collapses in the monsoon needs different storage from one that doesn't.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CACHE = ".geocache";
const OUT = "src/data/geo/attributes.ts";
const UA = "energy-sandbox attribute build (github.com/0xkalafia/energy-sandbox)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, label, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(90000),
    }).catch((e) => ({ ok: false, status: String(e).slice(0, 40) }));
    if (res.ok) return res.json();
    if (i === tries) throw new Error(`${label}: ${res.status}`);
    await sleep(8000 * i);
  }
}

async function cached(name, fn) {
  const file = join(CACHE, `${name}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const data = await fn();
  writeFileSync(file, JSON.stringify(data));
  await sleep(1200); // polite to two free services
  return data;
}

/**
 * For a request that is allowed to fail. PVGIS's tilt optimiser returns a
 * reproducible 500 for Yala's centroid while every other query at the same
 * coordinate answers fine — one province's optional extra should not end a
 * nationwide run. Failures are not cached, so a later run retries them.
 */
async function cachedOptional(name, fn) {
  try {
    return await cached(name, fn);
  } catch {
    return null;
  }
}

mkdirSync(CACHE, { recursive: true });

const src = readFileSync("src/data/geo/provinces.ts", "utf8");
const provinces = JSON.parse(src.match(/PROVINCES: ProvinceGeo\[\] = ([\s\S]*?);\n/)[1]);
console.log(`${provinces.length} provinces`);

// ---------- coastline ----------
/**
 * Coastal or not, derived rather than typed from a list.
 *
 * Every point of Thailand's coastline goes into a grid keyed by rounded
 * degree; a province is coastal when one of its outline vertices sits within
 * roughly 3 km of one. Deriving it means a boundary correction upstream
 * changes the answer, and it can be checked: Thailand has 23 coastal
 * provinces, so anything else means the threshold or the grid is wrong.
 */
console.log("coastline…");
const coast = await cached("_coastline", () =>
  getJson(
    "https://overpass-api.de/api/interpreter?" +
      new URLSearchParams({
        data: `[out:json][timeout:300];
way["natural"="coastline"](5.5,97.3,20.5,105.7);
out geom;`,
      }),
    "coastline",
  ),
);

const CELL = 0.05; // ~5.5 km cells
const coastGrid = new Map();
let coastPts = 0;
for (const w of coast.elements ?? []) {
  for (const p of w.geometry ?? []) {
    coastPts++;
    const k = `${Math.round(p.lat / CELL)},${Math.round(p.lon / CELL)}`;
    if (!coastGrid.has(k)) coastGrid.set(k, []);
    coastGrid.get(k).push([p.lon, p.lat]);
  }
}
console.log(`  ${coastPts.toLocaleString()} coastline points`);

const KM_PER_DEG_LAT = 110.57;
function kmTo(lon, lat, target) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  return Math.hypot((lon - target[0]) * kx, (lat - target[1]) * KM_PER_DEG_LAT);
}

// ---------- per province ----------
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
// Days per month, February averaged over the leap cycle: these turn PVGIS's
// monthly kWh/kWp into a capacity factor.
const DAYS_IN = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const out = [];
/** Provinces where PVGIS's tilt optimiser had to be overruled. */
const rescued = [];
for (const [i, p] of provinces.entries()) {
  const [lon, lat] = p.lonLat;

  // What a solar farm here would produce, not what falls on flat ground. The
  // difference is not a constant: measured, tilting gains +1.1% in Phuket and
  // +7.0% in Chiang Mai, so ignoring it would tilt every north-south
  // comparison the wrong way.
  //
  // Three requests, because PVGIS's own tilt optimiser cannot be trusted near
  // the equator, and it fails in two different ways here.
  //
  // Surat Thani: it returns slope 0° with azimuth -120°, labels it optimal,
  // and reports 460 kWh/kWp against 1,354 for plain horizontal — reproducibly,
  // as a normal 200 OK. A tilted panel cannot do worse than the same panel
  // lying flat, so that answer is impossible on its face.
  //
  // Yala: the same request at the same kind of coordinate returns a
  // reproducible HTTP 500, while horizontal and an explicit tilt both answer
  // fine at that exact point.
  //
  // So: ask for the optimum, allow it to fail, and check whatever comes back
  // against horizontal — the floor it can never fall below. If it fails either
  // test, fall back to an explicit tilt at the latitude and take whichever of
  // the three is actually best.
  const base = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=14&outputformat=json`;
  const flat = await cached(`_pv-${p.iso}`, () => getJson(base, `PVGIS flat ${p.iso}`));
  const opt = await cachedOptional(`_pvopt-${p.iso}`, () =>
    getJson(`${base}&optimalangles=1`, `PVGIS opt ${p.iso}`, 2),
  );

  const yield_ = (r) => r?.outputs?.totals?.fixed?.E_y ?? 0;
  let pv = yield_(opt) >= yield_(flat) ? opt : null;
  if (!pv) {
    // Latitude is a good tilt this close to the equator — PVGIS's own optima,
    // where it managed to find them, sat within a few degrees of it.
    const tilt = Math.min(30, Math.max(5, Math.round(lat)));
    const explicit = await cached(`_pvtilt-${p.iso}`, () =>
      getJson(`${base}&angle=${tilt}&aspect=0`, `PVGIS tilt ${p.iso}`),
    );
    pv = yield_(explicit) >= yield_(flat) ? explicit : flat;
    rescued.push(
      `${p.iso} ${p.en.padEnd(16)} optimiser ${opt ? `${Math.round(yield_(opt))} kWh/kWp vs ${Math.round(yield_(flat))} flat` : "HTTP error"} → used ${Math.round(yield_(pv))} at ${pv.inputs?.mounting_system?.fixed?.slope?.value}°`,
    );
  }
  const nasa = await cached(`_wind-${p.iso}`, () =>
    getJson(
      "https://power.larc.nasa.gov/api/temporal/climatology/point?" +
        new URLSearchParams({
          parameters: "ALLSKY_SFC_SW_DWN,WS50M",
          community: "RE",
          longitude: String(lon),
          latitude: String(lat),
          format: "JSON",
        }),
      `POWER ${p.iso}`,
    ),
  );

  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const monthly = pv.outputs?.monthly?.fixed ?? [];
  // E_m is kWh/kWp for the month; hours in that month turn it into a CF.
  const daysIn = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const solarByMonth = monthly.length === 12
    ? monthly.map((m, k) => +(m.E_m / (daysIn[k] * 24)).toFixed(3))
    : null;
  const windByMonth = MONTHS.map(
    (m) => +(nasa.properties?.parameter?.WS50M?.[m] ?? 0).toFixed(2),
  );

  out.push({
    iso: p.iso,
    solarCF: +((pv.outputs?.totals?.fixed?.E_y ?? 0) / 8760).toFixed(3),
    solarByMonth,
    tiltDeg: pv.inputs?.mounting_system?.fixed?.slope?.value ?? null,
    windMS50: +(nasa.properties?.parameter?.WS50M?.ANN ?? 0).toFixed(2),
    windByMonth,
    ghiKWhM2Day: +(nasa.properties?.parameter?.ALLSKY_SFC_SW_DWN?.ANN ?? 0).toFixed(2),
  });

  process.stdout.write(
    `  [${String(i + 1).padStart(2)}/${provinces.length}] ${p.iso} ${p.en.padEnd(22)} CF=${out.at(-1).solarCF} wind=${out.at(-1).windMS50}\r`,
  );
}
console.log(" ".repeat(80) + "\r");

// ---------- coastal, from the boundaries ----------
console.log("coastal test…");
const coastal = new Set();
for (const p of provinces) {
  const raw = JSON.parse(readFileSync(join(CACHE, `${p.iso}.json`), "utf8"));
  let near = false;
  outer: for (const rel of raw.elements ?? []) {
    for (const m of rel.members ?? []) {
      for (const q of m.geometry ?? []) {
        const k0 = Math.round(q.lat / CELL);
        const k1 = Math.round(q.lon / CELL);
        for (let a = -1; a <= 1 && !near; a++) {
          for (let b = -1; b <= 1 && !near; b++) {
            for (const c of coastGrid.get(`${k0 + a},${k1 + b}`) ?? []) {
              if (kmTo(q.lon, q.lat, c) < 3) {
                near = true;
                break;
              }
            }
          }
        }
        if (near) break outer;
      }
    }
  }
  if (near) coastal.add(p.iso);
}
console.log(`  ${coastal.size} coastal provinces (Thailand has 23)`);

for (const r of out) r.coastal = coastal.has(r.iso);

// ---------- gate, before anything is written ----------
if (rescued.length) {
  console.log(`\nPVGIS tilt optimiser overruled for ${rescued.length}:`);
  for (const line of rescued) console.log(`  ${line}`);
}

// Surat Thani's 0.052 reached the generated file on an earlier run and looked
// like just another number in a column of 77; the only reason it was caught is
// that someone read the column. Thailand's solar resource is uniform enough
// that anything outside this band is a failed request wearing a number.
const bad = out.filter(
  (r) =>
    !(r.solarCF > 0.1 && r.solarCF < 0.25) ||
    !(r.windMS50 > 0.5) ||
    r.solarByMonth?.length !== 12,
);
if (bad.length) {
  console.error(`\nRefusing to write — ${bad.length} province(s) came back implausible:`);
  for (const r of bad) console.error(`  ${r.iso}  solarCF=${r.solarCF}  wind=${r.windMS50}`);
  process.exit(1);
}

// ---------- emit ----------
writeFileSync(
  OUT,
  `// GENERATED by scripts/fetch-province-attributes.mjs — do not edit.
//
// Solar and wind resource per province, sampled at the province centre.
//
// solarCF is PV output per installed kWp at the optimal fixed tilt, divided by
// the hours in a year: a capacity factor measured rather than assumed. PVGIS
// puts Phetchaburi at ${out.find((r) => r.iso === "TH-76")?.solarCF} against the ~0.163 the season table in
// constants.ts implies. The annual level agrees well. The seasonal shape does
// not — see the note on solarByMonth.
//
// TRUST THESE TWO DIFFERENTLY.
//
// Solar is trustworthy. Cross-checked against NASA POWER, an independent
// satellite retrieval: the monthly curves agree at r = 0.955. Irradiance also
// varies smoothly across space, so a single sample stands for a province
// reasonably well.
//
// Wind is a floor, not an estimate. NASA POWER's grid is roughly 55 km, which
// is coarse enough that Phetchaburi contains two cells — measured, a point on
// the coast and a point 30 km away return identical numbers. Averaging over a
// cell that size flattens exactly the ridges and shorelines where turbines
// actually go, so the real resource at a real site is higher, by an amount
// this data cannot say. Use windMS50 to rank provinces, not to size a farm.
//
// The cross-province agreement between the two sources is only r = 0.668, so
// differences of ~0.01 in solarCF between neighbouring provinces are inside
// the noise and should not be read as real.
//
// Solar © European Union, PVGIS. Wind and irradiance from NASA POWER.
// Coastal flag derived from OpenStreetMap coastline data, ODbL.

export interface ProvinceResource {
  iso: string;
  /** Annual PV capacity factor at the province centre, optimal fixed tilt. */
  solarCF: number;
  /**
   * Twelve monthly capacity factors, January first.
   *
   * The seasonal swing here is far gentler than the model assumes. Averaged
   * into the app's four seasons, Phetchaburi runs 1.6x from best to worst
   * where CF_BY_SEASON implies 4.4x, and nearly all of the gap is one season:
   * the table puts monsoon solar at 0.05 against 0.128 measured. The model is
   * sizing storage for a solar drought the satellites do not see.
   */
  solarByMonth: number[] | null;
  /** Tilt PVGIS chose, degrees — rises with latitude. */
  tiltDeg: number | null;
  /** Mean wind speed at 50 m, m/s. A ~55 km cell average; read as a floor. */
  windMS50: number;
  windByMonth: number[];
  /** Global horizontal irradiance, kWh/m²/day. */
  ghiKWhM2Day: number;
  /** Boundary comes within 3 km of the coastline. */
  coastal: boolean;
}

export const PROVINCE_RESOURCE: ProvinceResource[] = ${JSON.stringify(out, null, 1)};
`,
);

const cf = out.map((r) => r.solarCF).filter(Boolean).sort((a, b) => a - b);
const wind = out.map((r) => r.windMS50).filter(Boolean).sort((a, b) => a - b);
console.log(`\nsolar CF   ${cf[0]} … ${cf.at(-1)}  (median ${cf[Math.floor(cf.length / 2)]})`);
console.log(`wind 50 m  ${wind[0]} … ${wind.at(-1)} m/s`);
console.log(`missing solar: ${out.filter((r) => !r.solarCF).length} · missing wind: ${out.filter((r) => !r.windMS50).length}`);
console.log(`wrote ${OUT}`);
