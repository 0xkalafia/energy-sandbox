# Phetchaburi 2046 — Energy Sandbox

Interactive provincial-scale energy simulator. Tune sliders and watch hourly
load, battery dispatch, carbon balance, resilience, and 20-year financials
update in real time.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/0xkalafia/energy-sandbox)

> Based on a 6-mission scenario for Phetchaburi province in 2046:
> Lifestyle/EV · DAC carbon capture · E-Methanol · Data Center · Desalination · Plasma Waste (+ wastewater).

## Stack

- **Vite** + **React 19** + **TypeScript**, **Tailwind CSS v4** (`@theme` tokens)
- **Recharts** charts · **Radix UI** primitives · **cmdk** command palette · **Sonner** toasts
- **Vitest** engine tests · web-worker Monte Carlo · installable PWA
- Verification: **Stryker** (mutation) · **playwright-core** + **axe-core**, driving the
  Chrome already on the machine

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
npm run dev:host   # …also reachable from a phone on the same Wi-Fi
```

| | |
|---|---|
| `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` | the CI gate |
| `npm run mutation` | do the tests actually catch bugs? |
| `npm run visual` · `npm run a11y` · `npm run keyboard` | needs a dev server |
| `npm run sw:check` | needs `npm run build` first |
| `npm run check:vercel` | validates vercel.json against Vercel's schema |

See [Verification](#verification) for what each one checks and what it found.

## Tabs (10)

| Tab | What |
|---|---|
| Overview | 6 KPI cards (with "why this number?" info) + 24h supply/demand + battery SoC + financial flow |
| Flow | Sankey: source → mission → output (GWh/day) |
| Hourly | Stacked supply vs demand + surplus calendar heatmap (month × hour) + load-duration curves |
| Battery | State-of-charge over 24h |
| Resilience | Multi-day SoC chaining · **Islanded vs Grid-backed** · blackout/curtailment · LOLE / EUE |
| Carbon | Emissions → DAC capture waterfall |
| Finance | **Time machine** (2026→2046 build-out) + 20-yr cashflow (degradation, EV S-curve, carbon band) + breakdown |
| Analysis | Sensitivity tornado + **min-CAPEX resilience optimizer** (heatmap) + **financial Monte Carlo** (payback distribution) |
| Map | Schematic of the 8 amphoe — distributed solar / wind / battery / missions |
| 🏠 House | Residential simulator for the real Phetchaburi home — solar/battery ROI, off-grid, EV |

Plus: scenario presets · URL-hash sharing · save + import/export (JSON + 24h CSV) ·
light/dark theme · ⌘K command palette · keyboard shortcuts (1–9 / R / S / T) ·
seasonal cooling demand · **installable PWA** (offline-capable).

## Engine model

Pure, testable functions in `src/engine/`:

1. **`computeDemandSizes`** — mission targets → GWh/day via process intensities.
2. **`simulateDay(inputs, {startSoC, gridLimitMW})`** — 24h merit-order dispatch.
   Demand splits into **critical** (lifestyle, must-serve) and **flexible**
   (missions, curtailable). Order: renewables → battery → grid(capped) → shed.
   `unmet` = critical blackout; `curtailed` = flexible deferred. Grid-backed by
   default (unmet ≡ 0); set `gridLimitMW: 0` for an islanded stress test.
3. **`shapeShiftable`** — water-fills a curtailable plant's daily energy into
   the hours with the most surplus. Daily energy is conserved exactly; a
   turndown floor and a boost ceiling keep the profile physical.
4. **`simulateMultiDay`** — chains real battery SoC day-to-day.
5. **`projectMultiYear`** — degradation + augmentation + EV adoption + carbon band.
6. **`runMonteCarlo`** / **`runFinancialMC`** — seeded stochastic weather (off
   the main thread) and financial-driver uncertainty → payback distribution.
7. **`optimizeResilientMix`** — grid-search the cheapest solar×battery that
   survives an islanded monsoon. **`computeSensitivity`** — ±N% tornado.
8. **`annualGrid` / `timeline`** — a 12-month representative year and the
   2026→2046 build-out. **`simulateHouse`** — the residential model.

Lifestyle load flexes with the season (summer cooling +20%), and annual figures
carry `ANNUAL_DEMAND_FACTOR` — the month-weighted average — so daily×365 ties out
to the yearly KPI. Methanol revenue splits export vs local
(`methanolLocalShare`) so a ton is sold **or** burned locally, never
double-counted. Plant CAPEX scales with utilisation (`PLANT_REFERENCE`) rather
than an on/off toggle, so a scenario that builds a tenth of the plan isn't
charged for the whole thing. Scenario JSON and share links are validated before
they reach the engine.

### Things the model says that the plan's authors didn't expect

Written down because each one contradicts an assumption someone held, and each
is pinned by a test so it can't drift back quietly:

- **More solar makes payback worse.** The baseline is already past the point
  where extra panels pay for themselves; methanol price is what pulls payback
  down.
- **Smart dispatch doesn't pay at ฿525/kWh.** Shifting DAC/desal/methanol into
  the sunny hours needs a plant sized for the peak, and that costs more than
  storing the energy until battery prices pass roughly ฿6,000/kWh. Off by
  default; tests lock both sides of that crossover.
- **The plan islands for a fortnight without a blackout**, monsoon included.
  Critical load is 7.5 of ~41 GWh/day and the missions curtail first, so there
  is far more headroom than the resilience tab's framing suggests.

## When something breaks

Two error boundaries: one around the tab panels from inside `<Tabs>`, so the
strip stays clickable and switching tabs clears the error, and one at the root
for everything else. Without them a render error anywhere left React with an
empty tree — a blank white page with nothing to click.

The likeliest cause isn't a bug in the code. Every tab past the first is a lazy
chunk, so shipping a new build while someone has the page open makes their next
tab click ask for a hash that no longer exists. The fallback tells that case
apart from a real bug and offers the recovery that actually works: clear the
caches and reload, rather than "try again".

## What this is *not*

A **scenario sandbox**, not an authoritative forecast. Cost/efficiency/load
assumptions live in `src/data/constants.ts` — edit them to fit your own priors.

## Verification

Five checks, because unit tests only ever covered the engine and most of this
app's surface isn't the engine.

| Check | Asks | Where it runs |
|---|---|---|
| `npm test` | does the engine compute the right numbers? | node |
| `npm run mutation` | would the tests notice if it didn't? | node |
| `npm run visual` | does it lay out correctly on real screens? | real Chrome |
| `npm run a11y` | can it be read? | real Chrome |
| `npm run keyboard` | can it be used without a mouse? | real Chrome |
| `npm run sw:check` | does it work offline, and survive a deploy? | real Chrome |

The four browser checks drive the Chrome already installed on the machine via
`playwright-core`, so there's no browser download. None of them are in CI:
text metrics depend on installed fonts, and a Linux runner without the Thai
font would report failures that don't exist here.

### `npm test` — 376 tests

Energy conservation, the islanded blackout path, seasonal demand tie-out, the
methanol split, real SoC chaining, the 20-year projection (degradation,
augmentation, EV S-curve, carbon band, IRR), both Monte Carlos, the tornado's
ordering, the optimizer's min-CAPEX feasibility, the 2026→2046 build-out,
district-allocation conservation, the residential model (marginal battery
payback, DoD floor), share-link round trips, and untrusted-input validation.

A **boundary sweep** asserts no NaN/Infinity for every value the sliders and the
importer allow — battery at 0, no supply, all missions off, round-trip 0.

### `npm run mutation` — 79%

A green suite proves the code ran, not that anything would have noticed it
being wrong. Stryker changes the engine on purpose — flips a comparison, drops
a clamp, swaps `+` for `-` — and reports how many survive. The first run killed
**36%**, with three modules that no test touched at all.

It's at **79%** now (engine 82%), and the gaps were real: the tornado's
ordering was untested even though the app reads "biggest lever" straight off
`rows[0]`; the twenty-year projection was at 21%; `stats.ts`, behind both Monte
Carlos, was at 8%; `simulate.ts` — the file every other number comes from — was
at 63%. Per-module scores and the surviving mutants land in
`reports/mutation/index.html`.

Four tests written during those passes failed on first run, and all four were
wrong about the code rather than the other way round. Three are in "Things the
model says" above; the fourth is that `shapeShiftable`'s second pass ignores
headroom on purpose — the first chases real surplus, and once that's gone the
remaining energy still has to be placed, which is what makes a monsoon day
degrade back toward flat instead of silently losing production.

Also worth recording: no share link this app can generate produces a `+` or `/`
in base64 — 0 of 20,000 tried, since every field is a number or a fixed season
string. The URL-safe substitution is correct and currently unreachable.

Still weak, worst first: `scenarios.ts` 34% — though 76% of its *covered* code,
the rest being browser download plumbing vitest can't reach — then `annual.ts`
68%, `multiDay.ts` 68%, `monteCarlo.ts` 72%, `sensitivity.ts` 78%.

Scoped to the pure modules; components and the four DOM-bound hooks are covered
by the browser checks instead, and leaving them in scope would report them as
untested when they aren't.

### `npm run visual`

Layout bugs kept slipping through — labels off the left edge, then off the
bottom once that was fixed, ribbons invisible in light mode, and on a phone the
tab strip silently made the whole page 790px wide at a 390px viewport.

**4 screen sizes × 2 colour schemes × 10 tabs**:

| | |
|---|---|
| PC | 1920×1080 |
| Notebook | 1440×900 |
| Tablet | 820×1180, touch |
| Phone | 390×844, touch + mobile UA |

**Fails** on a pane that scrolls sideways (naming the element that widened it),
content pushed past the edge where no scroll reaches it, and chart text
spilling outside its own SVG on any of the four edges. **Warns** on colliding
labels and tap targets under 32px. Full-page PNGs land in
`.visual/<tag>/<device>/<scheme>/`, because some faults aren't geometric —
white-on-white measures perfectly.

```bash
npm run dev
npm run visual -- --tag before --only phone
```

Every run re-checks its own emulation (viewport width, `pointer`,
`prefers-color-scheme`) and refuses to be trusted if it drifted. That exists
because the script once reported 26px tap targets on buttons that were
genuinely 36px, and again because a capture trick reflowed a 390px phone layout
to 830px and produced screenshots of a page nobody has.

### `npm run a11y`

axe-core in the real page, all ten tabs in both schemes, plus a contrast pass
over SVG chart text — which axe doesn't look at, and which is where most of
this app's words live.

First run: 26 failures. Every slider was unnamed (a Radix composite puts
`role="slider"` on a span, out of reach of `htmlFor`), so `Field` and
`ModuleRow` now pass their label id down through context. Dark-mode axis labels
sat at 3.01:1 against 4.5 required. And chasing the last two turned up a real
bug: on a fresh light-mode load the first tab's charts were painted in *dark*
theme colours, because `applyTheme` ran in an effect — one render too late for
`useChartTheme` to sample the right variables.

Each run reports how many chart labels it measured, because an early version
parsed colours with a regex over `rgba(...)`. The palette is OKLCH; it matched
nothing and reported a clean sweep of a file it had never looked at.

### `npm run keyboard`

Whether you can reach a control, see where you are, and get back out of an
overlay. Tab order was already sound — 35 stops, all on screen, all with a
focus ring. Two gaps weren't: the mobile drawer had no focus trap and ignored
Escape, and the charts sat in the tab order announcing themselves as an unnamed
"application" (recharts sets `role="application"` with arrow-key navigation of
the data points — good, but only once the chart has a name). Both fixed; all
sixteen chart instances across the ten tabs are labelled.

Its first version tested the drawer through a `[data-drawer]` attribute that
didn't exist, so "Escape closes it" passed against an app with no Escape
handler at all.

### `npm run sw:check`

The service worker had never run: registration is skipped on `localhost`, so
`npm run dev` never touched it. Served from 127.0.0.1 — a secure context that
clears that guard — a production build exercises the real thing. Checks that it
installs, that the app opens offline, and what happens to an open tab when a
new build ships (reproduced by moving one lazy chunk out of `dist`).

That last case is why navigations are network-first: serving a cached index
after a deploy hands the browser a list of chunk hashes that no longer exist.
Hashed assets stay cache-first, since their name changes when their contents do.

## Deployment

Vercel, from `vercel.json`: Vite preset, `npm ci` + `npm run build` → `dist`,
no environment variables. Pushing to `main` redeploys.

Cache headers are set explicitly because the two cases pull opposite ways.
Asset filenames carry a content hash, so a cached copy can never be the wrong
one — a year, immutable. `sw.js`, `index.html` and the manifest change every
deploy and carry no hash; a stale index is a list of chunk hashes the server no
longer has, and a stale worker keeps handing it out.

`npm run check:vercel` validates that file against Vercel's published schema.
Nothing else reads it — not the build, not CI — so a mistake there survives a
completely green gate and only surfaces as a failed deployment. Which is how
the first one failed: two `"comment"` keys inside `headers[]`, where the schema
sets `additionalProperties: false`. JSON has no comments, so the reasoning
lives here instead.

## CI

`.github/workflows/ci.yml` runs lint + typecheck + tests + build on every push.
The mutation and browser checks are local-only — see above for why.
