/**
 * Accessibility audit — real Chrome, every tab, both colour schemes.
 *
 * Two halves, because neither alone is enough here:
 *
 * 1. axe-core, injected into the page. It knows the rules that are tedious and
 *    easy to get wrong by hand — accessible names, roles, landmarks, duplicate
 *    ids, form labels — and it is the standard, so its verdicts are arguable
 *    with rather than invented.
 *
 * 2. A contrast pass over SVG chart text, which axe does not look at. This app
 *    is mostly charts: axis ticks, node labels and legends carry a large share
 *    of the meaning, and they are painted with `fill` on top of a card rather
 *    than as styled HTML. Every one of them could fail WCAG and axe would
 *    still report a clean page.
 *
 *   npm run dev
 *   npm run a11y
 *   npm run a11y -- --scheme dark --tag before
 *
 * Exits 1 on any serious/critical axe violation or any text below its WCAG AA
 * contrast threshold.
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");

const URL = process.env.VISUAL_URL ?? "http://localhost:5173";
const arg = (flag, fallback) =>
  process.argv.includes(flag)
    ? process.argv[process.argv.indexOf(flag) + 1]
    : fallback;
const ONLY_SCHEME = arg("--scheme", null);

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
 * Contrast of every SVG <text> against what is actually behind it.
 *
 * Runs in the page. Walks up from the text to the first ancestor with a
 * non-transparent background, composites any alpha along the way, and applies
 * the WCAG relative-luminance formula. Large text (>= 18.66px bold or >= 24px)
 * only needs 3:1; everything else needs 4.5:1.
 */
function auditSvgContrast() {
  /**
   * Resolve any CSS colour to RGBA by painting one pixel and reading it back.
   *
   * A regex over `rgba(...)` is the obvious approach and it is wrong here:
   * this app's palette is OKLCH, and getComputedStyle hands back
   * `oklch(0.5 0.01 270)` verbatim. The regex matched nothing, every text node
   * was skipped, and the audit reported a clean sweep of a file it had not
   * looked at. Canvas does the conversion the browser itself would.
   */
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const parse = (c) => {
    if (!c) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = c; // ignored if the browser can't parse it
    if (ctx.fillStyle === "#000000" && !/^(#000000|black|rgb\(0, ?0, ?0\))$/i.test(c.trim()))
      return null;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /** First real background behind an element, composited over white/black. */
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 1) break;
      }
    }
    const page = parse(getComputedStyle(document.body).backgroundColor) ?? {
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    };
    let base = { ...page, a: 1 };
    for (const l of layers.reverse()) base = over(l, base);
    return base;
  };

  const out = [];
  let examined = 0;
  for (const svg of document.querySelectorAll("svg")) {
    const box = svg.getBoundingClientRect();
    if (box.width < 40 || box.height < 40) continue;
    const bg = backdrop(svg);
    for (const t of svg.querySelectorAll("text")) {
      const label = (t.textContent ?? "").trim();
      if (!label) continue;
      const cs = getComputedStyle(t);
      const fill = parse(cs.fill);
      if (!fill) continue;
      examined++;
      // Rendered size, not the authored one. Inside a scaled viewBox the two
      // differ by a lot — the map's sea label is `fontSize="3"` and arrives on
      // screen around 18px — and WCAG's large-text allowance is about what the
      // reader actually sees.
      const ctm = t.getScreenCTM?.();
      const scale = ctm ? Math.hypot(ctm.a, ctm.b) || 1 : 1;
      const size = (parseFloat(cs.fontSize) || 12) * scale;
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(over(fill, bg), bg);
      if (got < need) {
        out.push({
          text: label.slice(0, 28),
          ratio: Math.round(got * 100) / 100,
          need,
          size: Math.round(size * 10) / 10,
        });
      }
    }
  }
  // One row per distinct message; a failing axis repeats 24 times otherwise.
  const seen = new Map();
  for (const o of out) {
    const key = `${o.ratio}|${o.size}`;
    if (!seen.has(key)) seen.set(key, { ...o, count: 1 });
    else seen.get(key).count++;
  }
  // `examined` is reported so a pass can be told apart from a no-op. This
  // check silently measured nothing at all on its first outing.
  return { examined, fails: [...seen.values()].sort((a, b) => a.ratio - b.ratio) };
}

const browser = await chromium.launch({ executablePath: CHROME });
let failures = 0;

for (const scheme of ["light", "dark"]) {
  if (ONLY_SCHEME && scheme !== ONLY_SCHEME) continue;

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    colorScheme: scheme,
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const tabs = await page.$$eval('[role="tab"]', (els) =>
    els.map((e) => e.textContent.trim()),
  );
  console.log(`\n══ ${scheme} ══`);

  for (let i = 0; i < tabs.length; i++) {
    const handles = await page.$$('[role="tab"]');
    await handles[i].click();
    await page
      .waitForFunction(
        () => !document.querySelector('[class*="animate-[shimmer"]'),
        { timeout: 8000 },
      )
      .catch(() => {});
    await page.waitForTimeout(700);

    // axe has to be re-injected after every navigation, but the tabs are all
    // one document, so once per page is enough.
    if (i === 0) await page.addScriptTag({ path: AXE_PATH });

    const results = await page.evaluate(async () => {
      const r = await axe.run(document, {
        resultTypes: ["violations"],
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        count: v.nodes.length,
        sample: v.nodes[0]?.html?.slice(0, 90) ?? "",
        target: v.nodes[0]?.target?.[0] ?? "",
      }));
    });

    const { examined, fails: contrast } = await page.evaluate(auditSvgContrast);

    const serious = results.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    const minor = results.filter(
      (v) => v.impact !== "serious" && v.impact !== "critical",
    );
    const bad = serious.length + contrast.length;
    console.log(
      `${bad ? "FAIL" : minor.length ? "warn" : "ok  "}  ${tabs[i]}  ` +
        `(${examined} chart labels measured)`,
    );

    for (const v of serious) {
      console.log(`        [${v.impact}] ${v.id} ×${v.count} — ${v.help}`);
      console.log(`              ${v.target}  ${v.sample}`);
    }
    for (const v of minor) {
      console.log(`        (${v.impact}) ${v.id} ×${v.count} — ${v.help}`);
    }
    for (const c of contrast) {
      console.log(
        `        contrast ${c.ratio}:1 (needs ${c.need}) at ${c.size}px ×${c.count} — "${c.text}"`,
      );
    }
    failures += bad;
  }
  await page.close();
}

await browser.close();
console.log(`\n${failures} accessibility failure(s)`);
process.exit(failures ? 1 : 0);
