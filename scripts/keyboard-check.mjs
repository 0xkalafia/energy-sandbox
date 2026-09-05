/**
 * Keyboard audit — the part of accessibility axe can't judge.
 *
 * axe checks that controls have names and roles. It can't tell you whether you
 * can actually reach them with Tab, whether you can see where you are, or
 * whether opening the mobile drawer drops you into a trap you can't Escape.
 * Those are the questions here, and they're asked by driving the keyboard.
 *
 *   npm run dev
 *   npm run keyboard
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const URL = process.env.VISUAL_URL ?? "http://localhost:5173";
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

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** Where focus is, in terms a human can read. */
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "body", name: "", visible: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") ?? "",
      name: (
        el.getAttribute("aria-label") ??
        el.textContent ??
        el.getAttribute("title") ??
        ""
      )
        .trim()
        .slice(0, 30),
      // In the viewport and not hidden — you can't follow focus you can't see.
      visible:
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== "hidden" &&
        cs.display !== "none",
      inDrawer: !!el.closest("[data-drawer]"),
      // A ring drawn by outline or box-shadow; either counts.
      ring:
        cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0
          ? "outline"
          : cs.boxShadow !== "none"
            ? "box-shadow"
            : "none",
    };
  });

const browser = await chromium.launch({ executablePath: CHROME });

// ── desktop ───────────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  console.log("\n── tab order, desktop ──");
  const seen = [];
  let offscreen = 0;
  let noRing = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    if (f.tag === "body") break;
    seen.push(f);
    if (!f.visible) offscreen++;
    if (f.ring === "none") noRing++;
  }
  check("Tab moves through the page", seen.length > 5, `${seen.length} stops`);
  check("every stop is visible", offscreen === 0, `${offscreen} hidden`);
  check(
    "every stop shows a focus indicator",
    noRing === 0,
    noRing ? `${noRing} without one: ${seen.filter((s) => s.ring === "none").map((s) => s.name || s.tag).slice(0, 4).join(", ")}` : "",
  );
  const firstFew = seen.slice(0, 6).map((s) => s.name || `<${s.tag}>`);
  console.log(`      first stops: ${firstFew.join(" → ")}`);

  console.log("\n── charts ──");
  /*
   * recharts puts `role="application"` and `tabIndex=0` on the surface and
   * gives it arrow-key navigation of the data points. That's a better answer
   * than `role="img"` — you can actually read the series — but only once the
   * chart has a name. Unnamed, it lands in the tab order announcing itself as
   * an application and nothing else, which is worse than not being reachable.
   * So the requirement is a name, not a particular role.
   */
  // Every tab, not just the one that happens to load first — that would have
  // covered two charts out of thirteen.
  const charts = [];
  const tabCount = (await page.$$('[role="tab"]')).length;
  for (let i = 0; i < tabCount; i++) {
    const handles = await page.$$('[role="tab"]');
    await handles[i].click();
    await page
      .waitForFunction(
        () => !document.querySelector('[class*="animate-[shimmer"]'),
        { timeout: 8000 },
      )
      .catch(() => {});
    await page.waitForTimeout(700);
    charts.push(
      ...(await page.evaluate(() =>
        [...document.querySelectorAll(".recharts-surface")].map((svg) => ({
          role: svg.getAttribute("role") ?? "",
          label: (svg.getAttribute("aria-label") ?? "").trim(),
          focusable: svg.getAttribute("tabindex") === "0",
          hidden: svg.getAttribute("aria-hidden") === "true",
        })),
      )),
    );
  }
  const unnamed = charts.filter((c) => !c.hidden && c.focusable && !c.label);
  check(
    "every focusable chart says what it is",
    charts.length > 0 && unnamed.length === 0,
    `${charts.length} chart instance(s) across ${tabCount} tabs, ${unnamed.length} unnamed`,
  );

  console.log("\n── the nationwide map, which is 77 buttons ──");
  /*
   * A map of 77 provinces cannot give each one a tab stop. Doing so would put
   * 77 stops between the metric switch and everything after the map, and
   * nobody tabs through that — they leave. So it is a roving tabindex: one
   * stop for the whole map, arrow keys to move inside it, focus following
   * selection.
   *
   * This is checked rather than assumed because the failure is invisible from
   * the outside. The province map next door has eight districts and is simply
   * tabbable; if someone copies that pattern here, nothing looks wrong and the
   * tab order quietly grows by 77.
   */
  {
    const tabHandles = await page.$$('[role="tab"]');
    const mapIndex = (
      await page.$$eval('[role="tab"]', (els) =>
        els.map((e) => e.textContent.trim()),
      )
    ).findIndex((t) => t.includes("Map"));
    await tabHandles[mapIndex].click();
    await page.waitForTimeout(600);
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        x.textContent.includes("ทั้งประเทศ"),
      );
      b?.click();
      return Boolean(b);
    });
    await page.waitForTimeout(900);

    const state = await page.evaluate(() => {
      const gs = [...document.querySelectorAll("svg [data-iso]")];
      return {
        provinces: gs.length,
        stops: gs.filter((g) => g.getAttribute("tabindex") === "0").length,
        named: gs.filter((g) => (g.getAttribute("aria-label") ?? "").trim()).length,
      };
    });
    check(
      "the map is one tab stop, not 77",
      opened && state.provinces > 70 && state.stops === 1,
      `${state.provinces} provinces, ${state.stops} tab stop(s)`,
    );
    check(
      "every province still announces itself",
      state.named === state.provinces,
      `${state.named}/${state.provinces} named`,
    );

    // Arrow keys have to move both the selection and the focus. Moving only
    // the selection leaves the single stop on an element that just became
    // untabbable, and the keyboard falls out of the map entirely — which is
    // exactly what the first implementation did.
    const moved = await page.evaluate(async () => {
      const first = document.querySelector("svg [data-iso]");
      first.focus();
      const from = document.activeElement?.getAttribute("data-iso");
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await new Promise((r) => setTimeout(r, 250));
      return {
        from,
        to: document.activeElement?.getAttribute("data-iso"),
        pressed: document
          .querySelector('[data-iso][aria-pressed="true"]')
          ?.getAttribute("data-iso"),
      };
    });
    check(
      "arrow keys move focus, not just selection",
      moved.to !== moved.from && moved.to === moved.pressed,
      `${moved.from} → focus ${moved.to}, selected ${moved.pressed}`,
    );
  }

  const handles = await page.$$('[role="tab"]');
  await handles[0].click();
  await page.waitForTimeout(800);

  // A name is the minimum; this is whether the keyboard layer actually does
  // anything once you're in there.
  const chartEl = await page.$(".recharts-surface");
  await chartEl?.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const cursorMoved = await page.evaluate(
    () => !!document.querySelector(".recharts-tooltip-wrapper *"),
  );
  check("arrow keys walk the data points", cursorMoved);

  await page.close();
}

// ── mobile drawer ─────────────────────────────────────────────────────────
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  console.log("\n── mobile drawer ──");
  await page.click('[aria-label="Open simulation controls"]');
  await page.waitForTimeout(600);

  const opened = await focused(page);
  check(
    "focus moves into the drawer when it opens",
    opened.inDrawer,
    opened.name || opened.tag,
  );

  // Tab a full lap; focus must never leave the drawer while it's open.
  let escaped = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    if (!f.inDrawer && f.tag !== "body") escaped++;
  }
  check("focus stays inside while it's open", escaped === 0, `${escaped} escapes`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const closed = await page.evaluate(
    () => !document.querySelector("[data-drawer]"),
  );
  check("Escape closes it", closed);

  const returned = await focused(page);
  check(
    "focus returns to the button that opened it",
    returned.name.includes("Open simulation controls") ||
      returned.role === "button" ||
      returned.tag === "button",
    returned.name || returned.tag,
  );

  await page.close();
}

await browser.close();
console.log(`\n${failures} keyboard failure(s)`);
process.exit(failures ? 1 : 0);
