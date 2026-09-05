/**
 * Interaction latency in a real browser — the one thing about this app that
 * had never been measured.
 *
 *   npm run dev
 *   npm run perf
 *
 * Why a script and not a console session: paint cost cannot be measured in a
 * hidden tab. A browser does not rasterise a page nobody can see, so
 * `requestAnimationFrame` never fires, a forced reflow returns almost
 * instantly, and every reading comes back near zero. Several apparently
 * precise numbers were collected that way before that was noticed. Playwright
 * drives a browser that is actually compositing, so the readings mean
 * something.
 *
 * Budget: 100ms is roughly where an interaction stops feeling instant. These
 * are medians of repeated runs, discarding the first, since the first click on
 * a lazily-loaded panel is dominated by its chunk arriving.
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const URL = process.env.VISUAL_URL ?? "http://localhost:5173";
const BUDGET_MS = Number(process.env.PERF_BUDGET ?? 100);

const CHROME = [
  process.env.VISUAL_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!CHROME) {
  console.error("No Chrome or Edge found — set VISUAL_CHROME to one.");
  process.exit(2);
}

let failures = 0;
const report = (name, median, detail) => {
  const over = median > BUDGET_MS;
  if (over) failures++;
  console.log(
    `${over ? "FAIL" : median > BUDGET_MS / 2 ? "warn" : "ok  "}  ${name.padEnd(34)} ${median.toFixed(1)}ms${detail ? `  ${detail}` : ""}`,
  );
};

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });

/**
 * Median wall time for one interaction, waiting for a real frame each time.
 *
 * The double rAF is what makes this honest: the first fires after the commit,
 * the second after the frame that commit produced has actually been painted.
 * Measuring to the end of the click handler would time React and miss the
 * rasterising, which on 77 detailed paths is most of the cost.
 */
async function median(label, action, runs = 9) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const ms = await page.evaluate(async (a) => {
      const el = document.querySelector(a.sel);
      if (!el) return -1;
      const t = performance.now();
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((res) =>
        requestAnimationFrame(() => requestAnimationFrame(res)),
      );
      return performance.now() - t;
    }, action(i));
    if (ms < 0) {
      console.log(`FAIL  ${label}: target not found`);
      failures++;
      return null;
    }
    samples.push(ms);
    await page.waitForTimeout(120);
  }
  // Drop the first: a lazy chunk or a cold path arrives on it and it is not
  // what anyone experiences twice.
  const rest = samples.slice(1).sort((a, b) => a - b);
  return rest[Math.floor(rest.length / 2)];
}

const byText = async (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      x.textContent.includes(t),
    );
    if (b) b.dataset.perf = "target";
    return Boolean(b);
  }, text);

console.log(`\n── nationwide map, ${1440}×900 ──`);
await page.evaluate(() =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "9", bubbles: true })),
);
await page.waitForTimeout(1200);
await byText("ทั้งประเทศ");
await page.click('[data-perf="target"]');
await page.waitForTimeout(900);

const shape = await page.evaluate(() => {
  const paths = [...document.querySelectorAll("svg [data-iso] path")];
  const svg = document.querySelector('svg[role="group"]');
  const box = svg?.getBoundingClientRect();
  return {
    provinces: paths.length,
    vertices: paths.reduce(
      (s, p) => s + (p.getAttribute("d").match(/[ML]/g) || []).length,
      0,
    ),
    px: box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "?",
  };
});
console.log(
  `      ${shape.provinces} provinces · ${shape.vertices.toLocaleString()} vertices · drawn at ${shape.px}px`,
);

// Metric buttons re-shade all 77 provinces — the heaviest interaction here.
const labels = ["แดด", "ลม", "ไฟที่ใช้", "พื้นที่อนุรักษ์"];
await page.evaluate((ls) => {
  for (const [i, t] of ls.entries()) {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.textContent.trim() === t,
    );
    if (b) b.dataset.metric = String(i);
  }
}, labels);

report(
  "switch metric (re-shades all 77)",
  await median("metric", (i) => ({ sel: `[data-metric="${i % labels.length}"]` })),
);

report(
  "select a province",
  await median("select", (i) => ({
    sel: `[data-iso="${["TH-50", "TH-30", "TH-84", "TH-10"][i % 4]}"]`,
  })),
);

// Zoomed in, the map swaps province outlines for amphoe boundaries: four
// times the geometry at four times the detail, and the state most likely to
// go slow. Zoom itself is measured too, since each step re-tests which
// provinces are on screen and may start a fetch.
report("zoom in one step", await median("zoomin", () => ({ sel: '[aria-label="ซูมเข้า"]' })), "");
await page.waitForTimeout(2500);
const zoomed = await page.evaluate(() => ({
  paths: document.querySelectorAll('svg[role="group"] g[data-iso] path').length,
  zoom: (document.body.innerText.match(/([\d.]+)x/) ?? [])[1],
}));
console.log(`      ${zoomed.paths} paths at ${zoomed.zoom}x`);
report(
  "switch metric while zoomed",
  await median("metric-zoomed", (i) => ({
    sel: `[data-metric="${i % labels.length}"]`,
  })),
);
await page.click('[aria-label="กลับไปเห็นทั้งประเทศ"]');
await page.waitForTimeout(700);

console.log(`\n── the province map, for comparison ──`);
await byText("เพชรบุรี 8 อำเภอ");
await page.click('[data-perf="target"]');
await page.waitForTimeout(700);
report(
  "select a district (8 shapes)",
  await median("district", (i) => ({
    sel: `svg [role="button"]:nth-of-type(${(i % 8) + 1})`,
  })),
);

await browser.close();
console.log(
  `\n${failures} interaction(s) over the ${BUDGET_MS}ms budget\n`,
);
process.exit(failures ? 1 : 0);
