/**
 * Turn the cached OSM boundaries into geometry the app can ship.
 *
 *   node scripts/fetch-thailand-boundaries.mjs   # first, fills .geocache/
 *   node scripts/build-thailand-geo.mjs
 *
 * Writes:
 *   src/data/geo/provinces.ts   77 provinces: names, area, bbox, outline
 *   src/data/geo/<iso>.ts       that province's amphoe, at finer detail
 *
 * One projection covers the whole country, so opening a province is a change
 * of viewBox over the same coordinates rather than a second coordinate system.
 * The per-province files are separate modules so the app can load one on
 * demand instead of carrying a megabyte of paths it isn't drawing.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  rings,
  simplifyWays,
  areaKm2,
  centroid,
  dissolve,
  makeProjection,
  toPath,
} from "./lib/geo.mjs";

const CACHE = ".geocache";
const OUT = "src/data/geo";

/** Coarse for the national view, finer inside one province. Both measured:
 *  ~900 m keeps the country readable at a few hundred pixels wide, ~200 m is
 *  where a single province stops losing coastline detail. */
const TOL_NATIONAL = 0.008;
const TOL_PROVINCE = 0.002;

const WIDTH = 1000;
const PAD = 8;

if (!existsSync(join(CACHE, "_province-list.json"))) {
  console.error("No cache — run scripts/fetch-thailand-boundaries.mjs first.");
  process.exit(1);
}
const provinces = JSON.parse(readFileSync(join(CACHE, "_province-list.json"), "utf8"));

// Official area and population, joined on the ISO code. The area is the
// cross-check: a province that disagrees with the record by more than a few
// per cent is missing an amphoe, or has picked up one that is not its own.
const attrs = existsSync(join(CACHE, "_wikidata.json"))
  ? JSON.parse(readFileSync(join(CACHE, "_wikidata.json"), "utf8"))
  : {};

/**
 * Keep only relations that are actually Thai amphoe.
 *
 * The fetch asks Overpass for admin_level=6 relations inside a province's
 * area, and that area is the province relation — which includes territorial
 * waters. Across a maritime border the query therefore also picks up the
 * neighbour's districts: Ranong came back with Kawthoung, a Myanmar district
 * of 13,584 km², five times the whole province, which on its own accounted
 * for 84% of the nationwide area error.
 *
 * Two signals, both from the data rather than from a list of names to exclude:
 * a foreign P-code, and a name:th that says จังหวัด (province) rather than
 * naming an amphoe. Deliberately not "name:th starts with อำเภอ" — that reads
 * plausible and drops two real ones, Bangkok's วัฒนา and Surat Thani's Tha
 * Chang, whose name:th is simply empty.
 */
function isThaiAmphoe(rel) {
  const t = rel.tags ?? {};
  const pcode = t.dt_pcode_1 ?? t["ref:pcode"] ?? "";
  if (pcode && !pcode.startsWith("TH")) return false;
  if ((t["name:th"] ?? "").startsWith("จังหวัด")) return false;
  return true;
}

// ---------- load and assemble ----------
console.log("assembling rings…");
const loaded = [];
const extent = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
for (const p of provinces) {
  const file = join(CACHE, `${p.iso}.json`);
  if (!existsSync(file)) {
    console.error(`missing cache for ${p.iso} — re-run the fetch script`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const rels = raw.elements ?? [];
  // Simplify each distinct way once per tolerance, so a border two amphoe
  // share stays bit-identical on both sides and the dissolve can cancel it.
  const waysFine = simplifyWays(rels, TOL_PROVINCE);
  const waysCoarse = simplifyWays(rels, TOL_NATIONAL);

  const amphoe = [];
  for (const rel of rels) {
    if (!isThaiAmphoe(rel)) continue;
    const exact = rings(rel);
    if (exact.length === 0) continue;
    amphoe.push({
      id: String(rel.id),
      th: (rel.tags["name:th"] ?? rel.tags.name ?? "").replace(/^อำเภอ|^เขต/, ""),
      en: (rel.tags["name:en"] ?? rel.tags.name ?? "").replace(/ (District|Subdistrict)$/, ""),
      // Area from the full-resolution rings; the simplified ones are for drawing.
      km2: exact.reduce((s, r) => s + areaKm2(r), 0),
      anchor: exact[0],
      fine: rings(rel, { ways: waysFine }),
      coarse: rings(rel, { ways: waysCoarse }),
    });
    for (const r of exact) for (const [lon, lat] of r) {
      if (lon < extent.minLon) extent.minLon = lon;
      if (lat < extent.minLat) extent.minLat = lat;
      if (lon > extent.maxLon) extent.maxLon = lon;
      if (lat > extent.maxLat) extent.maxLat = lat;
    }
  }
  loaded.push({ ...p, amphoe });
}

const projection = makeProjection(extent, WIDTH, PAD);
console.log(`  viewBox ${projection.width}×${projection.height}`);

// ---------- per-province ----------
mkdirSync(OUT, { recursive: true });

const index = [];
let totalAmphoe = 0;
let totalPts = 0;

for (const p of loaded) {
  // The province outline: drop borders shared by two of its amphoe.
  const outlineRings = dissolve(p.amphoe.map((a) => a.coarse));

  const km2 = Math.round(p.amphoe.reduce((s, a) => s + a.km2, 0));
  const biggest = p.amphoe.length
    ? p.amphoe.reduce((a, b) => (a.km2 > b.km2 ? a : b)).anchor
    : null;

  const projected = outlineRings.map((r) => r.map(projection.project));
  const flat = projected.flat();
  const bbox = flat.length
    ? [
        Math.min(...flat.map((q) => q[0])),
        Math.min(...flat.map((q) => q[1])),
        Math.max(...flat.map((q) => q[0])),
        Math.max(...flat.map((q) => q[1])),
      ].map((v) => +v.toFixed(1))
    : [0, 0, 0, 0];

  const a = attrs[p.iso] ?? {};
  index.push({
    iso: p.iso,
    th: p.th,
    en: p.en,
    wikidata: p.wikidata,
    km2,
    officialKm2: a.officialKm2 ?? null,
    population: a.population ?? null,
    populationYear: a.year && a.year !== "0" ? +a.year : null,
    amphoeCount: p.amphoe.length,
    bbox,
    centroid: biggest ? projection.project(centroid(biggest)).map((v) => +v.toFixed(1)) : [0, 0],
    outline: toPath(outlineRings, projection.project),
  });

  const body = `// GENERATED by scripts/build-thailand-geo.mjs — do not edit.
// ${p.en} (${p.iso}) — ${p.amphoe.length} amphoe.
// Data © OpenStreetMap contributors, ODbL.
import type { AmphoeGeo } from "./types";

export const AMPHOE: AmphoeGeo[] = ${JSON.stringify(
    p.amphoe.map((a) => ({
      id: a.id,
      th: a.th,
      en: a.en,
      km2: Math.round(a.km2),
      centroid: projection.project(centroid(a.anchor)).map((v) => +v.toFixed(1)),
      path: toPath(a.fine, projection.project),
    })),
  )};
`;
  writeFileSync(join(OUT, `${p.iso}.ts`), body);

  totalAmphoe += p.amphoe.length;
  totalPts += p.amphoe.reduce(
    (s, a) => s + a.fine.reduce((t, r) => t + r.length, 0),
    0,
  );
  process.stdout.write(`  ${p.iso} ${p.en.padEnd(22)} ${String(p.amphoe.length).padStart(3)} amphoe  ${String(km2).padStart(6)} km²\r`);
}
console.log(" ".repeat(70) + "\r");

// ---------- types + index ----------
writeFileSync(
  join(OUT, "types.ts"),
  `// GENERATED by scripts/build-thailand-geo.mjs — do not edit.

/** One amphoe, projected into the shared nationwide viewBox. */
export interface AmphoeGeo {
  /** OSM relation id — stable, and the join key back to the source. */
  id: string;
  th: string;
  en: string;
  /** Area in km², from the boundary itself. */
  km2: number;
  centroid: [number, number];
  path: string;
}

export interface ProvinceGeo {
  /** ISO 3166-2 code, e.g. "TH-76". */
  iso: string;
  th: string;
  en: string;
  /** Wikidata id, for joining population and other attributes. */
  wikidata: string | null;
  /** Area computed from the boundary. */
  km2: number;
  /** Area on record, for comparison. Where the two disagree by more than a few
   *  per cent, the boundary data is incomplete — Phichit is missing อำเภอสามง่าม,
   *  which has no admin_level=6 relation in OSM at all. */
  officialKm2: number | null;
  population: number | null;
  populationYear: number | null;
  amphoeCount: number;
  /** [minX, minY, maxX, maxY] in viewBox units — the viewBox to zoom to. */
  bbox: [number, number, number, number];
  centroid: [number, number];
  /** Province outline: the amphoe with their shared borders dissolved away. */
  outline: string;
}
`,
);

const totalKm2 = index.reduce((s, p) => s + p.km2, 0);

writeFileSync(
  join(OUT, "provinces.ts"),
  `// GENERATED by scripts/build-thailand-geo.mjs — do not edit.
//
// All 77 provinces, built from ${totalAmphoe} amphoe boundaries and projected into
// one ${projection.width}×${projection.height} viewBox. Areas are computed from the geometry, not
// copied from a table: they sum to ${totalKm2.toLocaleString()} km² against the official
// ~513,120 km² for Thailand.
//
// Province outlines are the amphoe with shared internal borders dissolved.
// The province relations in OSM are NOT used: Thailand's admin_level=4
// boundaries include territorial waters, which puts Surat Thani at 21,690 km²
// against an official 12,891 and swallows every island into one ring.
//
// Data © OpenStreetMap contributors, ODbL.
import type { ProvinceGeo } from "./types";

export const GEO_VIEWBOX = { width: ${projection.width}, height: ${projection.height} } as const;

export const PROVINCES: ProvinceGeo[] = ${JSON.stringify(index, null, 1)};

/** Amphoe for one province, loaded on demand. */
export async function loadAmphoe(iso: string) {
  const mod = await import(\`./\${iso}.ts\`);
  return mod.AMPHOE;
}
`,
);

console.log(`\n${index.length} provinces · ${totalAmphoe} amphoe · ${totalPts.toLocaleString()} points kept`);
console.log(`total area ${totalKm2.toLocaleString()} km² vs ~513,120 official (${(((totalKm2 - 513120) / 513120) * 100).toFixed(1)}%)`);
const outlinePts = index.reduce((s, p) => s + (p.outline.match(/L/g)?.length ?? 0), 0);
console.log(`national outline ${outlinePts.toLocaleString()} points, ${(index.reduce((s, p) => s + p.outline.length, 0) / 1024).toFixed(0)} kB`);

// ---------- quality report ----------
// Printed every run rather than checked once, because the honest summary of
// this dataset is not "it is right" but "here is how far it is from the
// record, province by province".
const cmp = index.filter((p) => p.officialKm2);
const dev = cmp
  .map((p) => ({ ...p, pct: ((p.km2 - p.officialKm2) / p.officialKm2) * 100 }))
  .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
const band = (lo, hi) => dev.filter((d) => Math.abs(d.pct) >= lo && Math.abs(d.pct) < hi).length;
console.log(
  `\narea vs the record (${cmp.length} provinces): ` +
    `within 2%: ${band(0, 2)} · 2-5%: ${band(2, 5)} · 5-10%: ${band(5, 10)} · over 10%: ${band(10, 1e9)}`,
);
console.log("worst:");
for (const d of dev.slice(0, 5)) {
  console.log(
    `  ${d.iso} ${d.en.padEnd(20)}${String(d.km2).padStart(7)} vs ${String(d.officialKm2).padStart(7)}  ${(d.pct >= 0 ? "+" : "") + d.pct.toFixed(1)}%`,
  );
}
const withPop = index.filter((p) => p.population).length;
console.log(`population present for ${withPop}/${index.length} provinces`);
