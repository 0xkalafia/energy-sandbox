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
- **Vitest** engine tests · web-worker Monte Carlo

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
npm run lint       # ESLint (CI gate)
npm test           # engine unit tests (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run visual     # chart layout audit (dev server must be running)
```

### `npm run visual`

Unit tests cover the engine; nothing covered what a visitor sees. Layout bugs
kept slipping through — labels off the left edge, then off the bottom once that
was fixed, ribbons invisible in light mode, and on a phone the tab strip
silently made the whole page 790px wide at a 390px viewport.

It drives the Chrome already installed on the machine (`playwright-core`, so no
browser download) over the full matrix — **4 screen sizes × 2 colour schemes ×
10 tabs** — and checks what a visitor would notice without opening devtools:

| | |
|---|---|
| PC | 1920×1080 |
| Notebook | 1440×900 |
| Tablet | 820×1180, touch |
| Phone | 390×844, touch + mobile UA |

**Fails** on a pane that scrolls sideways (it names the element that widened
it), content pushed past the edge where no scroll can reach it, and chart text
spilling outside its own SVG on any of the four edges. **Warns** on labels
colliding with each other and tap targets under 32px. Full-page PNGs land in
`.visual/<tag>/<device>/<scheme>/`, because some faults aren't geometric —
white-on-white measures perfectly.

```bash
npm run dev
npm run visual -- --tag before --only phone
```

Every run re-checks its own emulation (viewport width, `pointer`,
`prefers-color-scheme`) and refuses to be trusted if it drifted. That check
exists because it caught this script reporting 26px tap targets on buttons that
were genuinely 36px, and again when a capture trick reflowed a 390px phone
layout to 830px and produced screenshots of a page nobody has.

Kept out of CI on purpose: text metrics depend on installed fonts, so a Linux
runner without the Thai font would report clipping that doesn't exist here.

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
3. **`simulateMultiDay`** — chains real battery SoC day-to-day.
4. **`projectMultiYear`** — degradation + augmentation + EV adoption + carbon band.
5. **`runMonteCarlo`** / **`runFinancialMC`** — seeded stochastic weather (off
   the main thread) and financial-driver uncertainty → payback distribution.
6. **`optimizeResilientMix`** — grid-search the cheapest solar×battery that
   survives an islanded monsoon. **`computeSensitivity`** — ±N% tornado.
7. **`annualGrid` / `timeline`** — a 12-month representative year and the
   2026→2046 build-out. **`simulateHouse`** — the residential model.

Lifestyle load flexes with the season (summer cooling +20%), and annual figures
carry `ANNUAL_DEMAND_FACTOR` — the month-weighted average — so daily×365 ties out
to the yearly KPI. Methanol revenue splits export vs local
(`methanolLocalShare`) so a ton is sold **or** burned locally, never
double-counted. Plant CAPEX scales with utilisation (`PLANT_REFERENCE`) rather
than an on/off toggle, so a scenario that builds a tenth of the plan isn't
charged for the whole thing. Scenario JSON and share links are validated before
they reach the engine.

## What this is *not*

A **scenario sandbox**, not an authoritative forecast. Cost/efficiency/load
assumptions live in `src/data/constants.ts` — edit them to fit your own priors.

## Tests

`npm test` (53 tests) covers energy conservation, the islanded blackout path,
seasonal demand tie-out, methanol split, real SoC chaining, multi-year
monotonicity, Monte Carlo determinism, the optimizer's min-CAPEX feasibility,
the 2026→2046 build-out, district-allocation conservation, the residential model
(marginal battery payback, DoD floor), and untrusted-input validation.

A **boundary sweep** asserts no NaN/Infinity for every value the sliders and the
importer allow — battery at 0, no supply, all missions off, round-trip 0. That
class of bug previously had no coverage.

CI (`.github/workflows/ci.yml`) runs lint + typecheck + tests + build on every push.
