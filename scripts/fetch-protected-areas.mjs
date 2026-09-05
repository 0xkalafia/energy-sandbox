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
import { makeGrid, paint, measure, windowOf, clear } from "./lib/raster.mjs";

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
const GRID = makeGrid({ lon0: 97.0, lat0: 5.5, lon1: 105.8, lat1: 20.6, cell: CELL });

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

// ---------- paint the parks ----------
console.log("painting protected areas…");
const park = GRID.alloc();
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
  paint(GRID, park, rs);
  painted++;
}
const parkKm2 = measure(GRID, park, null).land;
console.log(`  ${painted} areas · ${Math.round(parkKm2).toLocaleString()} km² protected`);
console.log(`  Thailand's official protected estate is about 110,000 km² (21%)`);

// ---------- per province ----------
const provinces = JSON.parse(
  readFileSync("src/data/geo/provinces.ts", "utf8").match(
    /PROVINCES: ProvinceGeo\[\] = ([\s\S]*?);\n/,
  )[1],
);

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
const scratch = GRID.alloc();

for (const [i, p] of provinces.entries()) {
  const raw = JSON.parse(readFileSync(join(CACHE, `${p.iso}.json`), "utf8"));
  // One grid per province, reused across its amphoe: the union of the amphoe
  // is the province, and OR is exactly that union. The same foreign-district
  // filter the boundary build uses has to be applied here too — without it
  // Ranong's denominator included Kawthoung and its protected share was
  // measured against 16,875 km² instead of 3,279.
  const prov = GRID.alloc();
  const units = (raw.elements ?? []).filter(isThaiAmphoe);
  for (const rel of units) {
    paint(GRID, prov, [...rings(rel), ...rings(rel, { inner: true })]);
  }

  for (const rel of units) {
    const rs = [...rings(rel), ...rings(rel, { inner: true })];
    const win = windowOf(GRID, rs);
    if (!win) continue;
    paint(GRID, scratch, rs);
    const m = measure(GRID, scratch, park, win);
    clear(scratch, GRID, win);
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
      protectedFrac: +(m.both / m.land).toFixed(3),
      protectedKm2: +m.both.toFixed(0),
      rasterKm2: +m.land.toFixed(0),
    });
  }

  const { land, both: prot } = measure(
    GRID,
    prov,
    park,
    windowOf(GRID, units.flatMap((r) => rings(r))),
  );
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
