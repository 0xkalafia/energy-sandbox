/**
 * How much electricity each province actually uses.
 *
 *   node scripts/fetch-province-electricity.mjs
 *
 * Source: the Ministry of Energy's GD Catalog, dataset_41_07, six years of
 * per-province consumption by tariff class (BE 2561-2566 = 2018-2023). All 77
 * provinces, Bangkok included.
 *
 * This replaces an earlier plan that would have been much worse. The obvious
 * dataset — EPPO's per-province CSV — covers only 66 provinces for 2016-2017,
 * missing Bangkok, Chiang Mai and Khon Kaen among others, which together are
 * a third of national consumption. The plan was to estimate the missing ones
 * from population. Measured, that does not work: a log-log fit of consumption
 * on population gives R² = 0.33 overall and R² = 0.19 for industry, because
 * factories are not sited where people live. Rayong uses 87 times as much
 * electricity per person as Buri Ram, and no population model recovers that.
 * These files remove the need to guess at all.
 *
 * The old CSV is also visibly broken in places: Si Sa Ket reports 2 GWh of
 * residential electricity for 1.4 million people, which is 1.4 kWh per person
 * per year.
 *
 * Data: Ministry of Energy (gdcatalog.energy.go.th), open data licence.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readSheet } from "./lib/xlsx.mjs";

const CACHE = ".geocache";
const OUT = "src/data/geo/electricity.ts";
const BASE =
  "https://gdcatalog.energy.go.th/dataset/7fc9e90f-0433-4612-81ab-7f1d689f9271/resource";
const UA = "energy-sandbox electricity build (github.com/0xkalafia/energy-sandbox)";

/** Buddhist-era year → the resource holding that year's consumption. */
const YEARS = {
  2566: "0d386dd4-ee5e-439a-8c6c-10e1f5dfd010",
  2565: "49d9c7dd-866c-467a-b512-e7ecba34ae6c",
  2564: "a19c9a15-eebc-45f5-8073-326c565fef8d",
  2563: "e3a2aecc-3c1c-42ea-88ce-8759b0375344",
  2562: "378e0fb8-182b-48c8-a467-25d8920f67df",
  2561: "768abe48-8d1b-4195-8058-755e2f21b5a3",
};
const LATEST = 2566;

/**
 * Tariff classes, grouped.
 *
 * These are billing categories, not economic sectors, and the difference
 * matters: กิจการขนาดใหญ่ is "large-scale business", which is mostly industry
 * but is defined by connected load, not by what the customer does. Grouping
 * them as "business" rather than splitting into commercial and industrial
 * says only what the data says.
 *
 * EV charging gets its own group because the model has an EV adoption curve
 * and this is the only place a real starting value for it exists.
 */
const GROUPS = {
  residential: ["บ้านอยู่อาศัย"],
  business: ["กิจการขนาดเล็ก", "กิจการขนาดกลาง", "กิจการขนาดใหญ่", "กิจการเฉพาะอย่าง"],
  government: ["ราชการ/รัฐวิสาหกิจ", "ไฟฟ้าสาธารณะ"],
  agriculture: ["การสูบน้ำ"],
  ev: ["สถานีชาร์จรถEV"],
  other: ["ไฟสำรอง", "Interruptible Rate", "ไฟฟ้าชั่วคราว"],
};

mkdirSync(CACHE, { recursive: true });

async function workbook(be, id) {
  const file = join(CACHE, `_elec-${be}.xlsx`);
  if (!existsSync(file)) {
    const res = await fetch(`${BASE}/${id}/download/untitled.xlsx`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) throw new Error(`BE ${be}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readSheet(readFileSync(file));
}

const provinces = JSON.parse(
  readFileSync("src/data/geo/provinces.ts", "utf8").match(
    /PROVINCES: ProvinceGeo\[\] = ([\s\S]*?);\n/,
  )[1],
);
// The spreadsheet's รหัสจังหวัด is the same number as the ISO 3166-2 suffix,
// which makes the join exact rather than a name match across two different
// romanisations of Thai.
const isoOf = (code) => `TH-${String(code).padStart(2, "0")}`;
const known = new Set(provinces.map((p) => p.iso));

const byYear = {};
for (const [be, id] of Object.entries(YEARS)) {
  const rows = await workbook(be, id);
  const header = rows[0].map((h) => String(h ?? "").replace(/\(kWh\)\s*$/, "").trim());

  // Column positions differ between years — 2566 has an EV column that 2561
  // does not — so every year is read by header name, never by index.
  const colOf = {};
  for (const [group, labels] of Object.entries(GROUPS)) {
    colOf[group] = labels
      .map((l) => header.indexOf(l))
      .filter((i) => i >= 0);
  }
  const unmapped = header
    .slice(2)
    .filter((h) => h && !Object.values(GROUPS).flat().includes(h));
  if (unmapped.length) {
    console.error(`BE ${be}: unrecognised tariff class ${unmapped.join(", ")} — refusing to guess`);
    process.exit(1);
  }

  const out = new Map();
  for (const r of rows.slice(1)) {
    if (r[0] == null) continue;
    const iso = isoOf(r[0]);
    if (!known.has(iso)) {
      console.error(`BE ${be}: province code ${r[0]} (${r[1]}) is not one of the 77`);
      process.exit(1);
    }
    const g = {};
    for (const [group, cols] of Object.entries(colOf)) {
      g[group] = cols.reduce((s, c) => s + (typeof r[c] === "number" ? r[c] : 0), 0);
    }
    g.total = Object.values(g).reduce((s, v) => s + v, 0);
    out.set(iso, g);
  }
  byYear[be] = out;
  const twh = [...out.values()].reduce((s, g) => s + g.total, 0) / 1e9;
  console.log(`  BE ${be} (${+be - 543})  ${out.size} provinces  ${twh.toFixed(1)} TWh`);
}

// ---------- gate ----------
// Thailand consumed a little under 200 TWh in these years. A file that parsed
// into the wrong columns, or lost a province, lands far outside that.
const latest = byYear[LATEST];
const nationalTWh = [...latest.values()].reduce((s, g) => s + g.total, 0) / 1e9;
if (latest.size !== 77) {
  console.error(`\nRefusing to write — BE ${LATEST} has ${latest.size} provinces, not 77`);
  process.exit(1);
}
if (nationalTWh < 150 || nationalTWh > 250) {
  console.error(`\nRefusing to write — national total ${nationalTWh.toFixed(1)} TWh is not credible`);
  process.exit(1);
}

const GWH_PER_DAY = (kwh) => kwh / 1e6 / 365;
const rows = provinces.map((p) => {
  const g = latest.get(p.iso);
  const series = Object.keys(YEARS)
    .map(Number)
    .sort()
    .map((be) => +(byYear[be].get(p.iso).total / 1e6).toFixed(1));
  return {
    iso: p.iso,
    gwhPerYear: +(g.total / 1e6).toFixed(1),
    gwhPerDay: +GWH_PER_DAY(g.total).toFixed(3),
    kwhPerPerson: p.population ? Math.round(g.total / p.population) : null,
    byClass: Object.fromEntries(
      Object.keys(GROUPS).map((k) => [k, +(g[k] / 1e6).toFixed(1)]),
    ),
    series,
  };
});

writeFileSync(
  OUT,
  `// GENERATED by scripts/fetch-province-electricity.mjs — do not edit.
//
// Electricity actually consumed, per province, from the Ministry of Energy's
// GD Catalog (dataset_41_07). BE ${LATEST} (${LATEST - 543}) is the headline year;
// \`series\` carries BE 2561-${LATEST} so a trend is visible.
//
// All 77 provinces, measured — nothing here is estimated. That is worth
// stating because the obvious source is worse: EPPO's per-province CSV covers
// 66 provinces for 2016-2017 and omits Bangkok, Chiang Mai and Khon Kaen,
// which are a third of national demand. Filling those from population does
// not work — consumption against population fits at R² = 0.33, and R² = 0.19
// for industry, because factories are not sited where people live.
//
// The groups below are tariff classes, not economic sectors. "business" is
// small through large-scale commercial supply, which is defined by connected
// load rather than by what the customer does, so it holds both a shopping mall
// and a factory. Splitting it into commercial and industrial would be an
// invention.
//
// National total for BE ${LATEST}: ${nationalTWh.toFixed(1)} TWh.

export interface ProvinceElectricity {
  iso: string;
  /** GWh consumed in BE ${LATEST}. */
  gwhPerYear: number;
  /** The same figure per day, which is the unit the simulator works in. */
  gwhPerDay: number;
  /** kWh per resident per year — null where population is unknown. */
  kwhPerPerson: number | null;
  /** GWh by tariff class. EV charging is separate: it is the only real
   *  starting value the EV adoption curve has. */
  byClass: {
    residential: number;
    business: number;
    government: number;
    agriculture: number;
    ev: number;
    other: number;
  };
  /** Annual GWh, BE 2561 through ${LATEST}, oldest first. */
  series: number[];
}

export const PROVINCE_ELECTRICITY: ProvinceElectricity[] = ${JSON.stringify(rows, null, 1)};
`,
);

const sorted = [...rows].sort((a, b) => b.gwhPerYear - a.gwhPerYear);
console.log(`\nnational ${nationalTWh.toFixed(1)} TWh in BE ${LATEST}`);
console.log("largest consumers");
for (const r of sorted.slice(0, 5)) {
  const p = provinces.find((q) => q.iso === r.iso);
  console.log(`  ${p.en.padEnd(22)} ${r.gwhPerYear.toLocaleString().padStart(8)} GWh  (${r.gwhPerDay.toFixed(1)}/day)`);
}
console.log("smallest");
for (const r of sorted.slice(-3)) {
  const p = provinces.find((q) => q.iso === r.iso);
  console.log(`  ${p.en.padEnd(22)} ${r.gwhPerYear.toLocaleString().padStart(8)} GWh  (${r.gwhPerDay.toFixed(2)}/day)`);
}
const pb = rows.find((r) => r.iso === "TH-76");
console.log(`\nPhetchaburi ${pb.gwhPerYear} GWh/yr = ${pb.gwhPerDay} GWh/day · ${pb.kwhPerPerson} kWh per person`);
console.log(`  EV charging nationwide: ${(rows.reduce((s, r) => s + r.byClass.ev, 0) / 1000).toFixed(2)} TWh`);
console.log(`wrote ${OUT}`);
