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
npm test           # engine unit tests (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

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

Lifestyle load flexes with the season (summer cooling +20%). Methanol revenue
splits export vs local (`methanolLocalShare`) so a ton is sold **or** burned
locally, never double-counted.

## What this is *not*

A **scenario sandbox**, not an authoritative forecast. Cost/efficiency/load
assumptions live in `src/data/constants.ts` — edit them to fit your own priors.

## Tests

`npm test` (34 tests) covers energy conservation, the islanded blackout path,
seasonal demand, methanol split, real SoC chaining, multi-year monotonicity,
Monte Carlo determinism, the optimizer's min-CAPEX feasibility, the 2026→2046
build-out, district-allocation conservation, the residential model, and the
scenario-JSON round-trip. CI (`.github/workflows/ci.yml`) runs typecheck +
tests + build on every push.
