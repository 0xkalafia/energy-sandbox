/**
 * Visual QA — drives the real Chrome that's already on this machine and checks
 * every chart on every tab for the two things eyeballing keeps missing:
 * text that spills outside its own SVG (and so gets clipped), and labels that
 * land on top of each other.
 *
 * Both were real bugs. The Sankey's source labels sat off the left edge for
 * weeks, and the fix for that pushed two value labels off the bottom instead.
 * A DOM probe that only measured left/right happily reported "0 clipped".
 * So: measure all four edges, every tab, and drop a PNG next to the numbers.
 *
 *   node scripts/visual-check.mjs              # dev server must be running
 *   node scripts/visual-check.mjs --tag before # names the screenshot folder
 *
 * Exit code is 1 if anything is clipped, so CI can gate on it.
 */
import { chromium } from "playwright-core";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.VISUAL_URL ?? "http://localhost:5173";
const TAG = process.argv.includes("--tag")
  ? process.argv[process.argv.indexOf("--tag") + 1]
  : "latest";
const OUT = join(".visual", TAG);

/**
 * Point playwright-core at a browser that's already installed — that's the
 * whole reason for -core over the full `playwright` package, which would want
 * to download a few hundred MB of its own.
 */
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

/** Runs in the page. Returns every text node that breaks out of its chart. */
function auditGeometry() {
  const clipped = [];
  const overlaps = [];

  for (const svg of document.querySelectorAll("svg")) {
    const box = svg.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) continue; // icons, not charts
    const hidden = getComputedStyle(svg).overflow === "hidden";

    const labels = [];
    for (const t of svg.querySelectorAll("text")) {
      const b = t.getBoundingClientRect();
      if (b.width < 1 || !t.textContent?.trim()) continue;
      labels.push({ el: t, b });

      const over = {
        left: box.left - b.left,
        right: b.right - box.right,
        top: box.top - b.top,
        bottom: b.bottom - box.bottom,
      };
      const side = Object.keys(over).reduce((a, k) =>
        over[k] > over[a] ? k : a,
      );
      if (over[side] > 0.5) {
        clipped.push({
          text: t.textContent.trim(),
          side,
          px: Math.round(over[side] * 10) / 10,
          // overflow:visible means it spills but still renders — worth knowing,
          // because it may be clipped by an ancestor further up instead.
          hidden,
        });
      }
    }

    // Labels colliding with each other: overlap on both axes by >2px.
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].b;
        const c = labels[j].b;
        const dx = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const dy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (dx > 2 && dy > 2) {
          overlaps.push({
            a: labels[i].el.textContent.trim(),
            b: labels[j].el.textContent.trim(),
            px: Math.round(Math.min(dx, dy) * 10) / 10,
          });
        }
      }
    }
  }
  return { clipped, overlaps };
}

const browser = await chromium.launch({ executablePath: CHROME });
let failures = 0;

// Theme defaults to "system", so emulating the media query is enough to audit
// both. Worth doing every run: the label halo is painted in --color-bg, and a
// chart can be perfectly legible on one background and invisible on the other.
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  // Charts animate in; recharts also re-lays out once the container is measured.
  await page.waitForTimeout(1200);

  const tabs = await page.$$eval('[role="tab"]', (els) =>
    els.map((e) => e.textContent.trim()),
  );
  if (tabs.length === 0) {
    console.error("No tabs found — is the dev server serving the app?");
    await browser.close();
    process.exit(2);
  }

  const dir = join(OUT, scheme);
  mkdirSync(dir, { recursive: true });
  console.log(`\n── ${scheme} ──`);

  for (let i = 0; i < tabs.length; i++) {
    const name = tabs[i];
    const handles = await page.$$('[role="tab"]');
    await handles[i].click();
    await page.waitForTimeout(900);

    const { clipped, overlaps } = await page.evaluate(auditGeometry);
    const slug = `${String(i + 1).padStart(2, "0")}-${name.replace(/[^\w]+/g, "-").toLowerCase()}`;
    await page.screenshot({ path: join(dir, `${slug}.png`), fullPage: true });

    const mark = clipped.length ? "FAIL" : overlaps.length ? "warn" : "ok  ";
    console.log(`${mark}  ${name}`);
    for (const c of clipped) {
      console.log(`        clipped ${c.px}px off ${c.side}: "${c.text}"`);
    }
    for (const o of overlaps.slice(0, 5)) {
      console.log(`        overlap ${o.px}px: "${o.a}" / "${o.b}"`);
    }
    failures += clipped.length;
  }
  await page.close();
}

await browser.close();
console.log(`\n${failures} clipped label(s) · screenshots in ${OUT}`);
process.exit(failures ? 1 : 0);
