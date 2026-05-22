# Phetchaburi 2046 — Energy Sandbox

Interactive provincial-scale energy simulator. Tune sliders, see hourly load
profiles, battery dispatch, and financial outcomes update in real-time.

> Based on a 6-mission scenario for Phetchaburi province in 2046:
> Lifestyle/EV · DAC carbon capture · E-Methanol · Data Center · Desalination · Plasma Waste.

## Stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (with `@theme` design tokens)
- **Recharts** for interactive charts
- **Radix UI** primitives for accessible controls

## Design language

- Dark-first UI inspired by Linear / Vercel / Stripe dashboards
- OKLCH color palette with subtle radial-gradient backgrounds
- Inter (UI) + JetBrains Mono (numbers)
- Glass-morphism cards, tabular numerals, soft glow accents

## Quick start

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # production build
```

## Project layout

```
src/
├── App.tsx                      # Tabbed dashboard shell
├── index.css                    # Tailwind v4 + design tokens
├── data/
│   ├── types.ts                 # Sim inputs, hourly point, KPI types
│   └── constants.ts             # Baseline (Phet 2046), CF/load shapes
├── engine/
│   └── simulate.ts              # Pure functions: demand sizing, hourly
│                                #   supply, battery dispatch, KPI agg
├── lib/utils.ts                 # cn(), fmtBaht/Energy/Power/Pct
└── components/
    ├── layout/Sidebar.tsx       # All inputs (supply, demand, battery)
    ├── KPIGrid.tsx              # 6 KPI cards
    ├── charts/HourlyChart.tsx   # Stacked-area supply vs demand
    ├── charts/BatteryChart.tsx  # State of Charge over 24h
    └── ui/                      # Card, Slider, Switch, Tabs, Badge, Field
```

## Engine logic

1. **`computeDemandSizes(inputs)`** — turns mission targets (e.g. "1M ton CO₂ DAC")
   into GWh/day using per-process intensities (e.g. 2500 kWh/ton).
2. **`simulateDay(inputs)`** — builds 24 hourly buckets:
   - Supply: solar/wind shaped, biomass/hydro flat
   - Demand: lifestyle shaped, others flat baseline
   - Battery: greedy dispatch with DoD floor and round-trip loss
3. **`computeKPIs(inputs, hourly)`** — aggregates daily totals,
   battery cycles, annual carbon/financial flow, CAPEX/OPEX, payback.

## What this is *not*

This is a **scenario sandbox**, not an authoritative forecast. Cost,
efficiency, and load assumptions are projections discussed in May 2026 and
live in `src/data/constants.ts` — edit them to fit your own priors.

## Roadmap (post-MVP)

- [ ] Sankey diagram (energy flow → outputs)
- [ ] Multi-day simulation (monsoon streak resilience)
- [ ] Scenario presets (Conservative / Balanced / Aggressive)
- [ ] Save/load custom scenarios to URL hash
- [ ] CO₂ waterfall chart
- [ ] Multi-year cashflow & cumulative payback line
- [ ] Mobile / responsive layout
- [ ] Fix: scroll wheel inside sidebar adjusts sliders inadvertently
