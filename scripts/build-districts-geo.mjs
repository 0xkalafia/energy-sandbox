/**
 * Turn real Phetchaburi geography into SVG paths the app can ship.
 *
 *   node scripts/build-districts-geo.mjs
 *
 * Fetches the 8 amphoe boundaries, the Kaeng Krachan reservoir and the
 * national park from OpenStreetMap, simplifies them to a schematic level,
 * projects them into a fixed viewBox, and writes src/data/districtGeo.ts.
 *
 * The output is committed. The app never fetches anything at runtime, and it
 * carries no mapping library: pre-projected path strings cost a few kB where
 * shipping GeoJSON plus d3-geo would cost ten times that.
 *
 * Data © OpenStreetMap contributors, ODbL. Re-run only when the boundaries
 * need refreshing — the result is deterministic for a given OSM snapshot, so
 * a diff in the generated file means the source data actually moved.
 */
import { writeFileSync } from "node:fs";

const OVERPASS = "https://overpass-api.de/api/interpreter";

/**
 * ~200 m at this latitude. Chosen from measurement: the raw boundaries are
 * 31k points, this keeps about 1k of them, and the difference is invisible at
 * the size the map is drawn. Coarser starts eating real coastline detail
 * around Ban Laem, finer just adds bytes.
 */
const TOLERANCE = 0.002;

/** Everything is drawn into this box; height follows from the aspect ratio. */
const WIDTH = 1000;
const PAD = 12;

// Two things Overpass insists on, both found by trying: the query goes in a
// `data` form field (a raw body is a 406), and there has to be a User-Agent —
// node's default gets rejected, and identifying the tool is the etiquette for
// a public endpoint anyway.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(ql) {
  // The public endpoint rate-limits and times out under load; both are normal
  // and both are worth waiting through rather than hammering.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      body: new URLSearchParams({ data: ql }),
      headers: {
        "User-Agent": "energy-sandbox map build (github.com/0xkalafia/energy-sandbox)",
      },
      signal: AbortSignal.timeout(180000),
    }).catch((e) => ({ ok: false, status: String(e).slice(0, 40) }));

    if (res.ok) return res.json();
    if (attempt === 5) throw new Error(`Overpass ${res.status} after 5 attempts`);
    const wait = 15000 * attempt;
    console.log(`  Overpass ${res.status} — retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
}

const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/** Chain a relation's ways into closed rings, outer ones first. */
function rings(rel, { inner = false } = {}) {
  const pool = (rel.members ?? [])
    .filter(
      (m) =>
        m.type === "way" &&
        m.geometry &&
        (inner ? m.role === "inner" : m.role !== "inner"),
    )
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));

  const out = [];
  while (pool.length) {
    let ring = pool.shift();
    let joined = true;
    while (joined && !same(ring[0], ring.at(-1))) {
      joined = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (same(ring.at(-1), s[0])) ring = ring.concat(s.slice(1));
        else if (same(ring.at(-1), s.at(-1))) ring = ring.concat([...s].reverse().slice(1));
        else if (same(ring[0], s.at(-1))) ring = s.concat(ring.slice(1));
        else if (same(ring[0], s[0])) ring = [...s].reverse().concat(ring.slice(1));
        else continue;
        pool.splice(i, 1);
        joined = true;
        break;
      }
    }
    out.push(ring);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Douglas–Peucker, iterative so a long coastline can't blow the stack. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const segDist = (p, a, b) => {
    let [x, y] = a;
    const dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) [x, y] = b;
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };
  const t2 = tol * tol;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, k] = stack.pop();
    let maxd = 0, idx = -1;
    for (let m = i + 1; m < k; m++) {
      const d = segDist(pts[m], pts[i], pts[k]);
      if (d > maxd) { maxd = d; idx = m; }
    }
    if (maxd > t2) { keep[idx] = true; stack.push([i, idx], [idx, k]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** km² by shoelace on a local equal-ish projection. */
function areaKm2(ring) {
  const lat0 = ((ring.reduce((s, p) => s + p[1], 0) / ring.length) * Math.PI) / 180;
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.57;
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(a) / 2;
}

/** Area-weighted centroid — where a label actually belongs. */
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a *= 0.5;
  return a === 0 ? ring[0] : [cx / (6 * a), cy / (6 * a)];
}

console.log("fetching boundaries from OpenStreetMap…");

const admin = await query(`[out:json][timeout:180];
area["ISO3166-2"="TH-76"]->.p;
rel(area.p)["boundary"="administrative"]["admin_level"="6"];
out geom;`);

const features = await query(`[out:json][timeout:180];
(
  rel(897733);
  rel(6525839);
);
out geom;`);

if (admin.elements.length !== 8) {
  console.error(`Expected 8 amphoe, got ${admin.elements.length} — aborting.`);
  process.exit(1);
}

// ---------- project ----------
// Equirectangular with a cosine correction at the province's mid-latitude, so
// shapes keep their real proportions instead of being stretched east-west.
const all = admin.elements.flatMap((e) => rings(e).flat());
const lat0 =
  ((Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2) *
  (Math.PI / 180);
const kx = Math.cos(lat0);

const bounds = all.reduce(
  (b, [lon, lat]) => [
    Math.min(b[0], lon * kx), Math.min(b[1], -lat),
    Math.max(b[2], lon * kx), Math.max(b[3], -lat),
  ],
  [Infinity, Infinity, -Infinity, -Infinity],
);
const scale = (WIDTH - PAD * 2) / (bounds[2] - bounds[0]);
const HEIGHT = Math.round((bounds[3] - bounds[1]) * scale + PAD * 2);

const project = ([lon, lat]) => [
  +((lon * kx - bounds[0]) * scale + PAD).toFixed(1),
  +((-lat - bounds[1]) * scale + PAD).toFixed(1),
];

const toPath = (ringList) =>
  ringList
    .map((r) => "M" + r.map((p) => project(p).join(",")).join("L") + "Z")
    .join("");

// ---------- districts ----------
/** OSM English names → the ids the app already uses. */
const ID_BY_EN = {
  "Khao Yoi District": "khaoyoi",
  "Ban Laem District": "banlaem",
  "Nong Ya Plong District": "nongyaplong",
  "Mueang Phetchaburi District": "mueang",
  "Ban Lat District": "banlat",
  "Tha Yang District": "thayang",
  "Kaeng Krachan District": "kaengkrachan",
  "Cha-am District": "chaam",
};

const districts = [];
for (const rel of admin.elements) {
  const id = ID_BY_EN[rel.tags["name:en"]];
  if (!id) {
    console.error(`Unrecognised district: ${rel.tags["name:en"]} — aborting.`);
    process.exit(1);
  }
  const outer = rings(rel);
  const simplified = outer.map((r) => simplify(r, TOLERANCE));
  // Every Phetchaburi amphoe is a single polygon today, but say so out loud
  // rather than relying on it: an island or exclave appearing upstream would
  // otherwise understate the area and inflate the MW/km² reading, silently.
  if (outer.length > 1) {
    console.log(
      `  note: ${id} has ${outer.length} outer rings — area summed, label placed on the largest`,
    );
  }
  districts.push({
    id,
    km2: Math.round(outer.reduce((s, r) => s + areaKm2(r), 0)),
    centroid: project(centroid(outer[0])),
    path: toPath(simplified),
    points: simplified.reduce((s, r) => s + r.length, 0),
  });
}

// ---------- reservoir and park ----------
const overlay = {};
for (const rel of features.elements) {
  const key = rel.tags.boundary === "national_park" ? "park" : "reservoir";
  const outer = rings(rel).map((r) => simplify(r, TOLERANCE));
  const holes = rings(rel, { inner: true }).map((r) => simplify(r, TOLERANCE));
  overlay[key] = toPath([...outer, ...holes]);
}
for (const k of ["reservoir", "park"]) {
  if (!overlay[k]) {
    console.error(`Missing ${k} geometry — aborting.`);
    process.exit(1);
  }
}

// ---------- emit ----------
const totalKm2 = districts.reduce((s, d) => s + d.km2, 0);
const totalPts = districts.reduce((s, d) => s + d.points, 0);

const body = `// GENERATED by scripts/build-districts-geo.mjs — do not edit by hand.
//
// Real boundaries of the 8 amphoe of Phetchaburi, plus the Kaeng Krachan
// reservoir and national park, simplified to ~${TOLERANCE * 111} km and projected
// into a ${WIDTH}×${HEIGHT} viewBox.
//
// Data © OpenStreetMap contributors, licensed under the ODbL.
// https://www.openstreetmap.org/copyright
//
// Areas here are computed from the geometry, not copied from a table: they sum
// to ${totalKm2.toLocaleString()} km² against the official ${"~6,225"} km² for the province, which is
// the cross-check that the boundaries and the projection are both sane.

export interface DistrictGeo {
  id: string;
  /** Area in km², from the boundary itself. */
  km2: number;
  /** Area-weighted centroid in viewBox units — where a label belongs. */
  centroid: [number, number];
  /** SVG path in viewBox units. */
  path: string;
}

export const GEO_VIEWBOX = { width: ${WIDTH}, height: ${HEIGHT} } as const;

export const DISTRICT_GEO: DistrictGeo[] = ${JSON.stringify(
  districts.map(({ id, km2, centroid, path }) => ({ id, km2, centroid, path })),
  null,
  2,
)};

/** Kaeng Krachan reservoir — why hydro sits where it does. */
export const RESERVOIR_PATH = ${JSON.stringify(overlay.reservoir)};

/** Kaeng Krachan National Park. Extends past the province, so it is drawn
 *  clipped to the province outline. Why 42% of Phetchaburi can't host panels. */
export const PARK_PATH = ${JSON.stringify(overlay.park)};

`;

writeFileSync("src/data/districtGeo.ts", body);

console.log(`\nviewBox ${WIDTH}×${HEIGHT}, ${totalPts} points kept of 31k`);
console.log("district        km²    share");
for (const d of [...districts].sort((a, b) => b.km2 - a.km2)) {
  console.log(
    `  ${d.id.padEnd(14)}${String(d.km2).padStart(5)}  ${((d.km2 / totalKm2) * 100).toFixed(1).padStart(5)}%`,
  );
}
console.log(`  ${"TOTAL".padEnd(14)}${String(totalKm2).padStart(5)}  vs ~6,225 official`);
console.log("\nwrote src/data/districtGeo.ts");
