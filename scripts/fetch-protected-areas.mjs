/**
 * How much of each province is national park, wildlife sanctuary or reserve.
 *
 *   node scripts/fetch-protected-areas.mjs
 *
 * This exists because of a specific wrong answer the model gives today: the
 * Phetchaburi build hands Kaeng Krachan 1,520 MW of solar, and Kaeng Krachan is
 * mostly national park. Land that cannot be built on should not be counted as
 * land that can. A protected fraction per province is the input that lets the
 * allocation stop pretending otherwise.
 *
 * Method: rasterise, don't intersect. Real polygon intersection between 77
 * provinces and a few hundred protected areas is a lot of code to get subtly
 * wrong. Instead both sets are scan-converted onto a shared grid and the
 * overlap is counted. The error is then bounded by one thing — the cell size —
 * which is stated below and checked against known park areas at the end.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { rings, isThaiAmphoe } from "./lib/geo.mjs";

const CACHE = ".geocache";
const OUT = "src/data/geo/protected.ts";
const OUT_AMPHOE = "src/data/geo/protectedAmphoe.ts";
const UA = "energy-sandbox protected-area build (github.com/0xkalafia/energy-sandbox)";

/**
 * Grid cell size in degrees. 0.005° is about 550 m, so a province of 5,000 km²
 * is roughly 16,000 cells and its edge is resolved to well under 1%. Finer
 * costs memory on a 16 GB machine for accuracy the source data doesn't have.
 */
const CELL = 0.005;
const LON0 = 97.0;
const LAT0 = 5.5;
const NX = Math.ceil((105.8 - LON0) / CELL);
const NY = Math.ceil((20.6 - LAT0) / CELL);

mkdirSync(CACHE, { recursive: true });

const file = join(CACHE, "_protected.json");
let data;
if (existsSync(file)) {
  data = JSON.parse(readFileSync(file, "utf8"));
  console.log("protected areas: cached");
} else {
  console.log("protected areas: fetching…");
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": UA },
    body: new URLSearchParams({
      // boundary=national_park is the one that matters, and asking only for
      // protected_area misses it entirely: that query returned 253 areas and
      // 42,824 km² without Kaeng Krachan, the largest national park in the
      // country and the whole reason this script exists. OSM uses both tags
      // and Thai national parks are mostly under the first.
      //
      // Ways as well as relations: the big parks are multipolygon relations,
      // but plenty of smaller reserves are a single closed way.
      data: `[out:json][timeout:900];
area["ISO3166-1"="TH"]->.th;
(
  rel(area.th)["boundary"="national_park"];
  rel(area.th)["boundary"="protected_area"];
  rel(area.th)["leisure"="nature_reserve"];
  way(area.th)["boundary"="national_park"];
  way(area.th)["boundary"="protected_area"];
  way(area.th)["leisure"="nature_reserve"];
);
out geom;`,
    }),
    signal: AbortSignal.timeout(900000),
  });
  if (!res.ok) {
    console.error(`Overpass ${res.status}`);
    process.exit(1);
  }
  data = await res.json();
  writeFileSync(file, JSON.stringify(data));
}
console.log(`  ${data.elements?.length ?? 0} relations`);

/**
 * Scan-convert one shape into a grid, ORing it into whatever is already there.
 *
 * Every ring of the shape — outer and inner together — contributes its
 * crossings to the same raster row, and the row is filled on the even-odd
 * rule. Holes then come for free: a cell inside both a park and the enclave
 * carved out of it has an even crossing count and stays clear. A park with an
 * enclave is a real shape here, not a curiosity.
 *
 * Taking all rings in one call is also what makes ORing safe. Painting ring by
 * ring would need XOR to cut the holes, and XOR lets two overlapping shapes
 * cancel each other into empty space — two parks that share a border would
 * erase their overlap. Resolving even-odd inside the call and OR-ing the
 * result out means shapes can only ever add.
 *
 * No scratch buffer, deliberately: one per relation is 5.3 MB, and there are
 * 931 amphoe.
 */
function paint(grid, ringList) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of ringList) {
    for (const [, lat] of ring) {
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    }
  }
  if (minY === Infinity) return;
  const r0 = Math.max(0, Math.floor((minY - LAT0) / CELL));
  const r1 = Math.min(NY - 1, Math.ceil((maxY - LAT0) / CELL));
  const xs = [];
  for (let r = r0; r <= r1; r++) {
    const y = LAT0 + (r + 0.5) * CELL;
    xs.length = 0;
    for (const ring of ringList) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % n];
        if (y1 === y2) continue;
        // Half-open in y so a vertex exactly on the scanline is counted once,
        // not twice — the classic double-count that leaks fill sideways.
        if (y >= Math.min(y1, y2) && y < Math.max(y1, y2)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - LON0) / CELL - 0.5));
      const c1 = Math.min(NX - 1, Math.floor((xs[k + 1] - LON0) / CELL - 0.5));
      const base = r * NX;
      for (let c = c0; c <= c1; c++) grid[base + c] = 1;
    }
  }
}

/** km² of one cell at a given row — cells shrink as you go north. */
const cellKm2 = (r) =>
  CELL * 111.32 * Math.cos(((LAT0 + (r + 0.5) * CELL) * Math.PI) / 180) * CELL * 110.57;

// ---------- paint the parks ----------
console.log("painting protected areas…");
const park = new Uint8Array(NX * NY);
let painted = 0;
/** Rings of a protected area, whether OSM stored it as a way or a relation. */
function shapeRings(el) {
  if (el.type === "way") {
    const r = (el.geometry ?? []).map((p) => [p.lon, p.lat]);
    return r.length >= 4 ? [r] : [];
  }
  return [...rings(el), ...rings(el, { inner: true })];
}

for (const el of data.elements ?? []) {
  const rs = shapeRings(el);
  if (!rs.length) continue;
  paint(park, rs);
  painted++;
}
let parkKm2 = 0;
for (let r = 0; r < NY; r++) {
  const a = cellKm2(r);
  for (let c = 0; c < NX; c++) if (park[r * NX + c]) parkKm2 += a;
}
console.log(`  ${painted} areas · ${Math.round(parkKm2).toLocaleString()} km² protected`);
console.log(`  Thailand's official protected estate is about 110,000 km² (21%)`);

// ---------- per province ----------
const provinces = JSON.parse(
  readFileSync("src/data/geo/provinces.ts", "utf8").match(
    /PROVINCES: ProvinceGeo\[\] = ([\s\S]*?);\n/,
  )[1],
);

/**
 * Grid window covering a set of rings, clamped to the raster.
 *
 * Everything below is measured and cleared through one of these. Sweeping the
 * whole 1760 × 3020 grid once per amphoe would be 4.9 billion cell visits
 * across the 931 of them; an amphoe's own window is a few thousand.
 */
function windowOf(ringList) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const ring of ringList) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (minLon === Infinity) return null;
  return {
    r0: Math.max(0, Math.floor((minLat - LAT0) / CELL) - 1),
    r1: Math.min(NY - 1, Math.ceil((maxLat - LAT0) / CELL) + 1),
    c0: Math.max(0, Math.floor((minLon - LON0) / CELL) - 1),
    c1: Math.min(NX - 1, Math.ceil((maxLon - LON0) / CELL) + 1),
  };
}

/** Count land and protected land under whatever is painted into `grid`. */
function measure(grid, win) {
  const { r0, r1, c0, c1 } = win ?? { r0: 0, r1: NY - 1, c0: 0, c1: NX - 1 };
  let land = 0;
  let prot = 0;
  for (let r = r0; r <= r1; r++) {
    const a = cellKm2(r);
    const base = r * NX;
    for (let c = c0; c <= c1; c++) {
      const k = base + c;
      if (!grid[k]) continue;
      land += a;
      if (park[k]) prot += a;
    }
  }
  return { land, prot };
}

/** Zero just the window, so one scratch buffer serves every amphoe. */
function clear(grid, win) {
  for (let r = win.r0; r <= win.r1; r++) {
    grid.fill(0, r * NX + win.c0, r * NX + win.c1 + 1);
  }
}

const out = [];
/**
 * Per amphoe as well as per province, because the province figure cannot
 * answer the question that prompted this.
 *
 * Phetchaburi is 45% protected, which sounds like a mild constraint spread
 * evenly. It is not: nearly all of it is one amphoe. Kaeng Krachan is 42% of
 * the province by area and the model hands it 1,520 MW of solar. Only an
 * amphoe-level figure can say that the land is not there.
 */
const amphoeOut = [];
// One scratch grid reused for every amphoe. Allocating per amphoe would be
// 5.3 MB × 931 of churn on a machine that does not have it to spare.
const scratch = new Uint8Array(NX * NY);

for (const [i, p] of provinces.entries()) {
  const raw = JSON.parse(readFileSync(join(CACHE, `${p.iso}.json`), "utf8"));
  // One grid per province, reused across its amphoe: the union of the amphoe
  // is the province, and OR is exactly that union. The same foreign-district
  // filter the boundary build uses has to be applied here too — without it
  // Ranong's denominator included Kawthoung and its protected share was
  // measured against 16,875 km² instead of 3,279.
  const prov = new Uint8Array(NX * NY);
  const units = (raw.elements ?? []).filter(isThaiAmphoe);
  for (const rel of units) {
    paint(prov, [...rings(rel), ...rings(rel, { inner: true })]);
  }

  for (const rel of units) {
    const rs = [...rings(rel), ...rings(rel, { inner: true })];
    const win = windowOf(rs);
    if (!win) continue;
    paint(scratch, rs);
    const m = measure(scratch, win);
    clear(scratch, win);
    if (m.land <= 0) continue;
    amphoeOut.push({
      id: String(rel.id),
      iso: p.iso,
      // The English name travels with the figure so a consumer can join on it
      // without pulling in a province's geometry to look it up. districts.ts
      // needs exactly this and nothing else; importing the amphoe module for
      // it also defeated the lazy loading, since the bundler cannot both
      // statically and dynamically split the same file.
      en: (rel.tags?.["name:en"] ?? rel.tags?.name ?? "").replace(
        / (District|Subdistrict)$/,
        "",
      ),
      protectedFrac: +(m.prot / m.land).toFixed(3),
      protectedKm2: +m.prot.toFixed(0),
      rasterKm2: +m.land.toFixed(0),
    });
  }

  const { land, prot } = measure(prov, windowOf(units.flatMap((r) => rings(r))));
  out.push({
    iso: p.iso,
    protectedKm2: +prot.toFixed(0),
    protectedFrac: land ? +(prot / land).toFixed(3) : 0,
    // The rasterised area, kept so the fraction can be judged: if this is far
    // from the polygon area in provinces.ts, the grid is too coarse here.
    rasterKm2: +land.toFixed(0),
  });
  process.stdout.write(
    `  [${String(i + 1).padStart(2)}/77] ${p.en.padEnd(22)} ${(out.at(-1).protectedFrac * 100).toFixed(0)}% protected\r`,
  );
}
console.log(" ".repeat(70) + "\r");

// ---------- does the raster agree with the polygons? ----------
// The whole method rests on the grid being fine enough. This is the check:
// rasterised area against the area measured from the polygons themselves.
const errs = out
  .map((r) => {
    const p = provinces.find((q) => q.iso === r.iso);
    return { en: p.en, iso: r.iso, poly: p.km2, raster: r.rasterKm2, err: Math.abs(r.rasterKm2 - p.km2) / p.km2 };
  })
  .sort((a, b) => b.err - a.err);

console.log("\nraster vs polygon area, worst five:");
for (const e of errs.slice(0, 5)) {
  console.log(
    `  ${e.en.padEnd(22)} ${e.raster.toLocaleString().padStart(8)} vs ${Math.round(e.poly).toLocaleString().padStart(8)} km²  ${(e.err * 100).toFixed(1)}%`,
  );
}

// This is the gate, not a remark. A 550 m grid over a province of a few
// thousand km² should land within a couple of percent; anything much worse
// means the raster is not measuring the province it thinks it is, and every
// protectedFrac built on that denominator is wrong. It has already happened
// once — Ranong at +414%, because this script read the boundary cache without
// the foreign-district filter.
const broken = errs.filter((e) => e.err > 0.05);
if (broken.length) {
  console.error(`\nRefusing to write — ${broken.length} province(s) raster to the wrong area:`);
  for (const e of broken) console.error(`  ${e.iso} ${e.en}: ${(e.err * 100).toFixed(1)}%`);
  process.exit(1);
}

// Coverage against the record. OSM is community-mapped and can simply be
// missing parks; this line is what makes that visible instead of silently
// reporting a low protected fraction as if it were the truth.
console.log(
  `\nprotected total ${Math.round(parkKm2).toLocaleString()} km² against ~110,000 official — ` +
    `${((parkKm2 / 110000) * 100).toFixed(0)}% of the national estate is mapped here`,
);

writeFileSync(
  OUT,
  `// GENERATED by scripts/fetch-protected-areas.mjs — do not edit.
//
// National park, wildlife sanctuary and reserve coverage per province.
//
// Measured by scan-converting both the parks and the province boundaries onto
// a shared ${Math.round(CELL * 111000)} m grid and counting the overlap, rather than intersecting
// polygons. Accuracy is bounded by the cell size; the build prints rasterised
// area against polygon area for every province so that bound is visible.
//
// What this is for: land inside a national park is not available for a solar
// farm, and an allocation that ignores that will site capacity where it cannot
// be built.
//
// Data © OpenStreetMap contributors, ODbL. OSM's protected-area coverage of
// Thailand is good but not authoritative — treat these as close, not exact.

export interface ProvinceProtected {
  iso: string;
  protectedKm2: number;
  /** Share of the province inside a protected area, 0-1. */
  protectedFrac: number;
  /** Province area as the raster saw it, for judging the figure above. */
  rasterKm2: number;
}

export const PROVINCE_PROTECTED: ProvinceProtected[] = ${JSON.stringify(out, null, 1)};

export interface AmphoeProtected {
  /** OSM relation id — the same key AMPHOE uses. */
  id: string;
  iso: string;
  /** OSM's English name, so a consumer can join without loading geometry. */
  en: string;
  protectedKm2: number;
  protectedFrac: number;
  rasterKm2: number;
}

/**
 * Phetchaburi's eight, and only those.
 *
 * districts.ts needs them at module load to work out how much of each district
 * can be built on, and it cannot import the full 931 without dragging 94 kB
 * into the Map tab for every visitor, whether or not they ever open a
 * province. The rest live in protectedAmphoe.ts and are fetched with the
 * geometry when someone actually zooms in.
 */
export const PHETCHABURI_AMPHOE_PROTECTED: AmphoeProtected[] = ${JSON.stringify(
    amphoeOut.filter((a) => a.iso === "TH-76"),
    null,
    1,
  )};
`,
);

writeFileSync(
  OUT_AMPHOE,
  `// GENERATED by scripts/fetch-protected-areas.mjs — do not edit.
//
// Protected-area coverage for all 931 amphoe, which is the resolution the
// question actually needs.
//
// A province figure spreads the constraint evenly and hides where it falls.
// Phetchaburi reads 45% protected; almost all of that is Kaeng Krachan, one
// amphoe that is 42% of the province by area — and the one the allocation
// hands the most solar to. At 77% protected it still has 603 km² outside the
// park, which is why the objection turns out not to bite.
//
// Kept apart from protected.ts because it is 94 kB and only wanted once
// someone zooms into a province. Import it dynamically.
//
// Data © OpenStreetMap contributors, ODbL.
import type { AmphoeProtected } from "./protected";

export const AMPHOE_PROTECTED: AmphoeProtected[] = ${JSON.stringify(amphoeOut)};
`,
);

const top = [...out].sort((a, b) => b.protectedFrac - a.protectedFrac).slice(0, 8);
console.log("\nmost protected provinces");
for (const r of top) {
  const p = provinces.find((q) => q.iso === r.iso);
  console.log(`  ${p.en.padEnd(22)} ${(r.protectedFrac * 100).toFixed(0)}%  ${r.protectedKm2.toLocaleString()} km²`);
}
console.log(`\nwrote ${OUT}`);
