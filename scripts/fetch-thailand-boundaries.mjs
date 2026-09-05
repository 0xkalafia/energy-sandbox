/**
 * Pull every Thai amphoe boundary from OpenStreetMap, one province at a time.
 *
 *   node scripts/fetch-thailand-boundaries.mjs
 *
 * Responses are cached under .geocache/, so this is resumable: a run that dies
 * halfway, or a later run that only needs one province refreshed, doesn't
 * re-download the rest. That matters — the raw data is around 180 MB across
 * 930 amphoe, and Overpass is a shared public endpoint.
 *
 * Why amphoe and not the province relations, which would be 77 requests
 * instead of 77 × N: Thailand's admin_level=4 relations include territorial
 * waters. Measured, Surat Thani comes out at 21,690 km² against an official
 * 12,891, and every province collapses to a single ring with its islands
 * swallowed. The amphoe are land-only and sum correctly — 13,074 km² for the
 * same province, 1.4% out. Provinces get rebuilt from them later.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const CACHE = ".geocache";
const UA = "energy-sandbox boundary build (github.com/0xkalafia/energy-sandbox)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(ql, label) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      body: new URLSearchParams({ data: ql }),
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(240000),
    }).catch((e) => ({ ok: false, status: String(e).slice(0, 40) }));

    if (res.ok) return res.json();
    if (attempt === 6) throw new Error(`${label}: Overpass ${res.status} after 6 tries`);
    const wait = 20000 * attempt;
    console.log(`    ${label}: ${res.status}, retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
}

/** Cached fetch — the whole point of being able to run this more than once. */
async function cached(name, ql) {
  const file = join(CACHE, `${name}.json`);
  if (existsSync(file)) {
    return { data: JSON.parse(readFileSync(file, "utf8")), hit: true };
  }
  const data = await query(ql, name);
  writeFileSync(file, JSON.stringify(data));
  // Deliberate pacing between misses. The endpoint is free and shared; a
  // nationwide pull is exactly the sort of thing that gets a client blocked.
  await sleep(2500);
  return { data, hit: false };
}

mkdirSync(CACHE, { recursive: true });

console.log("provinces…");
const { data: provinces } = await cached(
  "_provinces",
  `[out:json][timeout:180];
rel["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"~"^TH-"];
out tags;`,
);

const list = provinces.elements
  .map((e) => ({
    iso: e.tags["ISO3166-2"],
    en: (e.tags["name:en"] ?? e.tags.name).replace(/ Province$/, ""),
    th: e.tags["name:th"] ?? e.tags.name,
    wikidata: e.tags.wikidata ?? null,
    ref: e.tags.ref ?? null,
  }))
  .sort((a, b) => a.iso.localeCompare(b.iso));

if (list.length !== 77) {
  console.error(`Expected 77 provinces, got ${list.length} — aborting.`);
  process.exit(1);
}
writeFileSync(join(CACHE, "_province-list.json"), JSON.stringify(list, null, 2));
console.log(`  ${list.length} provinces`);

let hits = 0;
let misses = 0;
let amphoeTotal = 0;
const empty = [];

for (const [i, p] of list.entries()) {
  const { data, hit } = await cached(
    p.iso,
    `[out:json][timeout:240];
area["ISO3166-2"="${p.iso}"]->.p;
rel(area.p)["boundary"="administrative"]["admin_level"="6"];
out geom;`,
  );
  const n = data.elements?.length ?? 0;
  amphoeTotal += n;
  hit ? hits++ : misses++;
  if (n === 0) empty.push(p.iso);
  console.log(
    `  [${String(i + 1).padStart(2)}/77] ${p.iso} ${p.en.padEnd(24)} ${String(n).padStart(3)} amphoe ${hit ? "(cached)" : ""}`,
  );
}

// ---------- official area and population, for the join and the cross-check ----------
// Wikidata rather than a hand-typed table: OSM already carries a wikidata id on
// every province, so the join key is in the data. The official area is what
// turns "here is a polygon" into "here is a polygon that agrees with the
// record to within x%", which is the only way to notice a province quietly
// missing an amphoe.
const wdFile = join(CACHE, "_wikidata.json");
if (!existsSync(wdFile)) {
  console.log("\nwikidata: area and population…");
  const sparql = `SELECT ?prov ?iso ?pop ?popDate ?area WHERE {
  ?prov wdt:P31 wd:Q50198 ; wdt:P300 ?iso .
  OPTIONAL { ?prov p:P1082 ?ps . ?ps ps:P1082 ?pop . OPTIONAL { ?ps pq:P585 ?popDate } }
  OPTIONAL { ?prov wdt:P2046 ?area }
}`;
  const res = await fetch(
    "https://query.wikidata.org/sparql?" + new URLSearchParams({ query: sparql }),
    { headers: { Accept: "application/sparql-results+json", "User-Agent": UA } },
  );
  if (!res.ok) {
    console.error(`  wikidata query failed: ${res.status}`);
    process.exit(1);
  }
  const json = await res.json();
  // Several population statements per province; keep the most recent dated one.
  const best = new Map();
  for (const b of json.results.bindings) {
    const iso = b.iso?.value;
    if (!iso) continue;
    const year = b.popDate?.value?.slice(0, 4) ?? "0";
    const prev = best.get(iso);
    if (!prev || year > prev.year) {
      best.set(iso, {
        year,
        population: b.pop ? Math.round(+b.pop.value) : null,
        officialKm2: b.area ? +(+b.area.value).toFixed(0) : null,
      });
    }
  }
  writeFileSync(wdFile, JSON.stringify(Object.fromEntries(best), null, 1));
  console.log(`  ${best.size} provinces`);
}

console.log(`\n${amphoeTotal} amphoe total · ${hits} cached, ${misses} fetched`);
if (empty.length) {
  // Bangkok has khet rather than amphoe and may come back empty; anything else
  // is a hole that would leave a province missing from the map entirely.
  console.log(`provinces with no amphoe returned: ${empty.join(", ")}`);
}
