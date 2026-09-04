/**
 * Service-worker check — does the offline story actually hold up?
 *
 * The worker had never run once. It only registers when the hostname isn't
 * "localhost", so `npm run dev` never exercises it, and until this script it
 * had only ever been read, not tested. 127.0.0.1 is a secure context that
 * clears that guard, so a production build served there is the real thing.
 *
 * Three questions, in order of how much they'd hurt:
 *   1. Does it install and cache anything at all?
 *   2. Does the app still load with the network cut?
 *   3. What happens to someone holding an open tab when a new build ships —
 *      the case the ErrorBoundary's stale-chunk path was written for.
 *
 *   npm run build && npm run sw:check
 */
import { chromium } from "playwright-core";
import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.SW_URL ?? "http://127.0.0.1:4173";

const CHROME = [
  process.env.VISUAL_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
].find((p) => p && existsSync(p));
if (!CHROME) {
  console.error("No Chrome found — set VISUAL_CHROME.");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: CHROME });
// A fresh profile per run: a worker left over from a previous run would make
// the first-visit case untestable.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const state = () =>
  page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    const keys = (await caches?.keys?.()) ?? [];
    const entries = [];
    for (const k of keys) {
      const c = await caches.open(k);
      entries.push(...(await c.keys()).map((r) => new URL(r.url).pathname));
    }
    return {
      controlled: !!navigator.serviceWorker?.controller,
      active: reg?.active?.state ?? null,
      caches: keys,
      cached: entries.sort(),
      tabs: document.querySelectorAll('[role="tab"]').length,
      charts: document.querySelectorAll(".recharts-surface").length,
      bodyText: (document.body.textContent ?? "").trim().length,
    };
  });

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

console.log(`\n── first visit (${URL}) ──`);
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // registration happens on window load
let s = await state();
check("service worker reaches 'activated'", s.active === "activated", String(s.active));
check("a cache was created", s.caches.length > 0, s.caches.join(", "));
console.log(`      cached on first visit: ${s.cached.length} entr(ies)`);
console.log(`      ${JSON.stringify(s.cached.slice(0, 8))}`);

console.log("\n── second visit (worker now in control) ──");
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
s = await state();
check("page is controlled by the worker", s.controlled);
check("app still renders", s.tabs === 10 && s.charts > 0, `${s.tabs} tabs, ${s.charts} charts`);
console.log(`      cached after a controlled load: ${s.cached.length} entries`);

console.log("\n── the document is fetched fresh, not served from cache ──");
{
  // The whole point of the navigation strategy. If the index comes out of the
  // cache, a deploy leaves the tab asking for chunk hashes that are gone.
  let documentRequests = 0;
  const count = (r) => {
    if (r.resourceType() === "document") documentRequests++;
  };
  page.on("request", count);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  page.off("request", count);
  check(
    "a reload asks the network for the HTML",
    documentRequests > 0,
    `${documentRequests} document request(s)`,
  );
}

console.log("\n── offline ──");
await ctx.setOffline(true);
let offlineOk = true;
try {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
} catch (e) {
  offlineOk = false;
  console.log(`      navigation threw: ${String(e).split("\n")[0].slice(0, 80)}`);
}
await page.waitForTimeout(2000);
s = offlineOk ? await state() : { tabs: 0, charts: 0, bodyText: 0 };
check(
  "app loads with the network cut",
  offlineOk && s.tabs === 10,
  `${s.tabs} tabs, ${s.charts} charts, ${s.bodyText} chars of text`,
);
await ctx.setOffline(false);

console.log("\n── a new build ships while the tab is open ──");
/*
 * Reproduced by moving one lazy chunk out of `dist` rather than by rebuilding.
 * The effect on the open tab is identical — its index still asks for a hash
 * the server no longer has — and it leaves the working tree alone. The House
 * tab is chosen because nothing has visited it, so its chunk isn't in the
 * cache either and the request genuinely has nowhere to go.
 *
 * Only meaningful against a server reading from this `dist`. Pointed at a
 * deployed URL the rename changes nothing on the far end, every chunk still
 * resolves, and the check would "fail" for want of an error it never caused.
 */
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(URL);
const assets = join("dist", "assets");
const chunk = isLocal
  ? readdirSync(assets).find((f) => /^HouseMode-.*\.js$/.test(f))
  : null;
let moved = null;
if (!isLocal) {
  console.log(
    `skip  ${URL} isn't served from this dist — a local rename can't take a chunk off it`,
  );
} else if (!chunk) {
  check("a lazy chunk to remove was found", false, "run npm run build first");
} else {
  moved = join(assets, chunk + ".moved");
  renameSync(join(assets, chunk), moved);

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const handles = await page.$$('[role="tab"]');
  await handles[handles.length - 1].click(); // House
  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => ({
    alert: !!document.querySelector('[role="alert"]'),
    heading:
      document.querySelector('[role="alert"] h2')?.textContent?.trim() ?? null,
    buttons: [...document.querySelectorAll('[role="alert"] button')].map((b) =>
      b.textContent.trim(),
    ),
    tabs: document.querySelectorAll('[role="tab"]').length,
  }));

  check("a missing chunk doesn't blank the page", after.alert, after.heading ?? "no alert");
  check("the tab strip survives, so you can navigate away", after.tabs === 10);
  check(
    "it's recognised as a stale build, not a code bug",
    after.buttons.some((b) => b.includes("โหลดเวอร์ชันใหม่")),
    after.buttons.join(" / ") || "no buttons",
  );

  renameSync(moved, join(assets, chunk));
  moved = null;
}

await browser.close();
console.log(`\n${failures} service-worker failure(s)`);
process.exit(failures ? 1 : 0);
