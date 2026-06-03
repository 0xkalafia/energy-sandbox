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

## Tabs

| Tab | What |
|---|---|
| Overview | 6 KPI cards + 24h supply/demand + battery SoC + financial flow |
| Flow | Sankey: source → mission → output (GWh/day) |
| Hourly / Battery | Stacked supply vs demand · state-of-charge |
| Resilience | Multi-day chaining, **Islanded vs Grid-backed**, blackout/curtailment |
| Carbon | Emissions → DAC capture waterfall |
| Finance | 20-yr cashflow w/ battery degradation, EV S-curve, carbon-price band |
| Analysis | Sensitivity tornado (more coming: optimizer, financial MC) |

Plus: scenario presets, URL-hash sharing, save/export (JSON + CSV), light/dark
theme, ⌘K palette, keyboard shortcuts (1–8 / R / S / T).

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
5. **`runMonteCarlo`** — seeded stochastic weather (runs off the main thread).

Methanol revenue splits export vs local (`methanolLocalShare`) so a ton is sold
**or** burned locally, never double-counted.

## What this is *not*

A **scenario sandbox**, not an authoritative forecast. Cost/efficiency/load
assumptions live in `src/data/constants.ts` — edit them to fit your own priors.

## Tests

`npm test` covers energy conservation, the islanded blackout path, methanol
split, real SoC chaining, multi-year monotonicity, and Monte Carlo determinism.
CI (`.github/workflows/ci.yml`) runs typecheck + tests + build on every push.
