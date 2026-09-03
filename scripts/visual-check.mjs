/**
 * Visual QA — drives the real Chrome that's already on this machine and checks
 * every tab on the four screen sizes people actually own, in both colour
 * schemes. It looks for the things a visitor would notice immediately:
 *
 *   1. the page scrolling sideways (the classic phone failure)
 *   2. something sticking out past the right edge of the screen
 *   3. chart text spilling outside its own SVG, so it gets clipped
 *   4. labels landing on top of each other
 *   5. tap targets too small to hit on a touch screen (warning only)
 *
 * Every one of these has bitten this app. The Sankey's source labels sat off
 * the left edge for weeks; the fix pushed two value labels off the bottom
 * instead, and a hand-written probe that only compared left/right reported a
 * clean chart the whole time. So: measure all four edges, every size, and drop
 * a PNG next to the numbers — some faults aren't geometric at all. The Sankey
 * ribbons were once white-on-white in light mode, perfectly positioned and
 * completely invisible.
 *
 *   npm run dev
 *   npm run visual
 *   npm run visual -- --tag before --only phone   # narrow it down
 *
 * Exits 1 if anything fails, so it can gate a release.
 */
import { chromium } from "playwright-core";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.VISUAL_URL ?? "http://localhost:5173";
const arg = (flag, fallback) =>
  process.argv.includes(flag)
    ? process.argv[process.argv.indexOf(flag) + 1]
    : fallback;
const TAG = arg("--tag", "latest");
const ONLY = arg("--only", null);
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

/**
 * Viewports, not device names: what matters is the CSS pixel box the layout
 * has to work in. These are the common sizes for each class of machine, taken
 * in the orientation people hold them in.
 */
const DEVICES = [
  { id: "pc", label: "PC 1920×1080", width: 1920, height: 1080, dsf: 1 },
  { id: "notebook", label: "Notebook 1440×900", width: 1440, height: 900, dsf: 1 },
  { id: "tablet", label: "Tablet 820×1180", width: 820, height: 1180, dsf: 2, touch: true },
  { id: "phone", label: "Phone 390×844", width: 390, height: 844, dsf: 2, touch: true, mobile: true },
];

/** Minimum comfortable tap target. Below this a finger misses. */
const MIN_TAP = 32;

/** Runs in the page. Everything a visitor would spot without opening devtools. */
function auditPage([isTouch, minTap]) {
  const clipped = [];
  const overlaps = [];
  const cutoff = [];
  const smallTargets = [];

  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const describe = (el) => ({
    tag: el.tagName.toLowerCase(),
    cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 50),
    text: (el.textContent ?? "").trim().slice(0, 36),
  });

  // 1. Anything that makes the page itself drift sideways, or falls off the
  // edge entirely.
  //
  // Two traps here, both of which this check walked into before:
  //
  // - The shell is `overflow-hidden`, so `document.scrollWidth` can never
  //   report a sideways scroll however far something sticks out. It just
  //   vanishes silently, which is worse. So measure against the viewport.
  // - The content pane is `overflow-y-auto`, and CSS turns the *other* axis
  //   into `auto` too. Treating "sits inside a scroller" as "fine, the user
  //   can scroll to it" therefore excused the whole page scrolling sideways.
  //   A strip that scrolls on purpose (the tab bar) is small; a pane that
  //   fills the screen is the page.
  for (const el of document.querySelectorAll("body *, body")) {
    const drift = Math.round(el.scrollWidth - el.clientWidth);
    if (drift <= 1) continue;
    if (el.clientWidth < vw * 0.6 || el.clientHeight < vh * 0.5) continue;
    cutoff.push({ ...describe(el), past: drift, kind: "pane" });
    // Name the widest thing inside it, which is usually the cause.
    let worst = null;
    for (const child of el.querySelectorAll("*")) {
      const b = child.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const past = Math.round(b.right - vw);
      if (past <= 1) continue;
      if ([...child.children].some((c) => c.getBoundingClientRect().right - vw > 1))
        continue;
      if (!worst || past > worst.past) worst = { ...describe(child), past };
    }
    if (worst) cutoff.push({ ...worst, kind: "cause" });
    break; // one pane is enough; the rest are its ancestors
  }

  // Content clipped away by an overflow-hidden ancestor: unreachable at any
  // scroll position.
  for (const el of document.querySelectorAll("body *")) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const past = Math.round(b.right - vw);
    if (past <= 1) continue;
    if ([...el.children].some((c) => c.getBoundingClientRect().right - vw > 1))
      continue;
    // Only things a visitor could actually be deprived of. Decoration that
    // overflows a parent built to clip it is doing its job — the loading
    // skeleton's shimmer is an `inset-0` overlay inside an overflow-hidden
    // box, and reporting it as lost content was pure noise.
    const meaningful =
      (el.textContent ?? "").trim().length > 0 ||
      el.matches('button, a, input, select, textarea, img, [role], [aria-label]');
    if (!meaningful) continue;
    let reachable = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") {
        reachable = true;
        break;
      }
      if (ox === "hidden" || ox === "clip") break;
    }
    if (reachable) continue;
    cutoff.push({ ...describe(el), past, kind: "hidden" });
  }

  // 2 + 3. Chart text against the SVG that's meant to contain it.
  for (const svg of document.querySelectorAll("svg")) {
    const box = svg.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) continue; // icons, not charts
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
        });
      }
    }
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

  // 4. Touch ergonomics.
  if (isTouch) {
    const seen = new Set();
    for (const el of document.querySelectorAll(
      'button, a, [role="tab"], input[type="checkbox"], [role="switch"]',
    )) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.top > window.innerHeight * 4) continue; // far below the fold

      // What the finger can hit, not what the eye can see. A small control
      // (the toggle switch) keeps its looks and grows its target with an
      // absolutely-positioned ::after on negative insets; measuring only the
      // element's own box would report it as too small forever.
      let [w, h] = [b.width, b.height];
      const after = getComputedStyle(el, "::after");
      if (after.content !== "none" && after.position === "absolute") {
        const out = (v) => Math.max(0, -parseFloat(v) || 0);
        w += out(after.left) + out(after.right);
        h += out(after.top) + out(after.bottom);
      }
      const min = Math.round(Math.min(w, h));
      if (min >= minTap) continue;
      const d = describe(el);
      const key = d.text || d.cls;
      if (seen.has(key)) continue;
      seen.add(key);
      smallTargets.push({ label: d.text || `<${d.tag}>`, cls: d.cls, min });
    }
  }

  return {
    cutoff: cutoff.slice(0, 6),
    clipped,
    overlaps,
    smallTargets,
    // Reported back so the run can prove it measured what it claims to have
    // measured. A tap-target check under `pointer: fine` is meaningless, and
    // silently wrong numbers are worse than no numbers.
    env: {
      vw,
      coarse: matchMedia("(pointer: coarse)").matches,
      dark: matchMedia("(prefers-color-scheme: dark)").matches,
    },
  };
}

/**
 * Capture everything, on the layout the visitor actually gets.
 *
 * The shell is `h-screen` with the content in its own `overflow-y-auto` pane,
 * so the document never scrolls and an ordinary screenshot shows one viewport.
 * The two obvious ways round that both produce pictures of a page nobody has:
 *
 * - `fullPage: true` overrides device metrics behind the scenes and doesn't
 *   restore `isMobile`, so every shot after the first quietly dropped the page
 *   to `pointer: fine`. That's how this script spent a run reporting 26px tap
 *   targets that were really 36px.
 * - Injecting CSS to let the document grow (`overflow: visible` on the shell)
 *   changes the mobile layout viewport: at 390px wide the page re-laid out to
 *   830 and the capture cut it in half. Every card in the shot was clipped —
 *   a bug that existed only because of the measuring.
 *
 * Growing the viewport instead needs neither. `h-screen` follows it, the app
 * simply becomes as tall as its content, and width, `pointer` and the colour
 * scheme are all untouched. Measured: card width identical before and after.
 */
const MAX_SHOT_HEIGHT = 8000;

async function screenshotWholePage(page, path, viewport) {
  const contentHeight = () =>
    page.evaluate(() => {
      const main = document.querySelector("main");
      return Math.ceil(Math.max(main?.scrollHeight ?? 0, document.body.scrollHeight));
    });
  const grow = async () => {
    const h = Math.min(
      Math.max((await contentHeight()) + 8, viewport.height),
      MAX_SHOT_HEIGHT,
    );
    await page.setViewportSize({ width: viewport.width, height: h });
    await page.waitForTimeout(350); // charts re-measure on resize
  };
  try {
    await grow();
    await grow(); // a taller pane can reflow; settle on the second pass
    await page.screenshot({ path });
  } finally {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
  }
}

const browser = await chromium.launch({ executablePath: CHROME });
let hardFails = 0;
const warnings = [];

for (const device of DEVICES) {
  if (ONLY && device.id !== ONLY) continue;

  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.dsf,
      colorScheme: scheme,
      hasTouch: !!device.touch,
      isMobile: !!device.mobile,
    });

    await page.goto(URL, { waitUntil: "networkidle" });
    // Charts animate in; recharts re-lays out once the container is measured.
    await page.waitForTimeout(1200);

    const tabs = await page.$$eval('[role="tab"]', (els) =>
      els.map((e) => e.textContent.trim()),
    );
    if (tabs.length === 0) {
      console.error("No tabs found — is the dev server serving the app?");
      await browser.close();
      process.exit(2);
    }

    const dir = join(OUT, device.id, scheme);
    mkdirSync(dir, { recursive: true });
    console.log(`\n── ${device.label} · ${scheme} ──`);

    for (let i = 0; i < tabs.length; i++) {
      const name = tabs[i];
      const handles = await page.$$('[role="tab"]');
      try {
        await handles[i].click({ timeout: 4000 });
      } catch {
        // A drawer or sticky header can swallow the click on small screens;
        // the app also binds 1-9 to the tabs.
        await page.evaluate((n) => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: String(n), bubbles: true }),
          );
        }, i + 1);
      }
      // Most panels are lazy chunks behind a skeleton. Measuring while that
      // is still up reads the placeholder's geometry, not the chart's — it
      // produced a 300px "overflow" that existed for a few hundred ms and was
      // never on screen when the page had settled.
      await page
        .waitForFunction(
          () => !document.querySelector('[class*="animate-[shimmer"]'),
          { timeout: 8000 },
        )
        .catch(() => {});
      await page.waitForTimeout(900);

      const r = await page.evaluate(auditPage, [!!device.touch, MIN_TAP]);
      const slug = `${String(i + 1).padStart(2, "0")}-${name.replace(/[^\w]+/g, "-").toLowerCase()}`;
      await screenshotWholePage(page, join(dir, `${slug}.png`), {
        width: device.width,
        height: device.height,
      });

      const bad =
        r.env.vw !== device.width ||
        r.env.coarse !== !!device.touch ||
        r.env.dark !== (scheme === "dark");
      if (bad) {
        console.error(
          `        emulation drifted: ${JSON.stringify(r.env)} — results not trustworthy`,
        );
        process.exitCode = 2;
      }

      const hard = r.clipped.length + r.cutoff.length;
      const soft = r.overlaps.length + r.smallTargets.length;
      console.log(`${hard ? "FAIL" : soft ? "warn" : "ok  "}  ${name}`);

      for (const o of r.cutoff) {
        const what =
          o.kind === "pane"
            ? `pane scrolls sideways ${o.past}px`
            : o.kind === "cause"
              ? `  └ pushed out ${o.past}px by`
              : `${o.past}px past the edge and unreachable`;
        console.log(
          `        ${what}: <${o.tag} class="${o.cls}"> ${JSON.stringify(o.text)}`,
        );
      }
      for (const c of r.clipped) {
        console.log(`        clipped ${c.px}px off ${c.side}: "${c.text}"`);
      }
      for (const o of r.overlaps.slice(0, 4)) {
        console.log(`        overlap ${o.px}px: "${o.a}" / "${o.b}"`);
      }
      for (const t of r.smallTargets.slice(0, 6)) {
        console.log(`        tap target ${t.min}px: "${t.label}"  class="${t.cls}"`);
      }

      hardFails += hard;
      if (soft) warnings.push(`${device.id}/${scheme}/${name}`);
    }
    await page.close();
  }
}

await browser.close();
console.log(
  `\n${hardFails} hard failure(s), ${warnings.length} tab(s) with warnings · screenshots in ${OUT}`,
);
process.exit(hardFails ? 1 : 0);
