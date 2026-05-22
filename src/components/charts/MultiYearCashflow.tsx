import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  Cell,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { fmtBaht, fmtPct } from "@/lib/utils";
import type { KPIs, SimInputs } from "@/data/types";
import {
  DEFAULT_MULTI_YEAR,
  projectMultiYear,
  type MultiYearOptions,
} from "@/engine/multiYear";

interface Props {
  kpis: KPIs;
  inputs: SimInputs;
}

export function MultiYearCashflow({ kpis, inputs }: Props) {
  const [opts, setOpts] = useState<MultiYearOptions>(DEFAULT_MULTI_YEAR);

  const projection = useMemo(
    () => projectMultiYear(kpis, inputs, opts),
    [kpis, inputs, opts],
  );

  const update = <K extends keyof MultiYearOptions>(
    key: K,
    val: MultiYearOptions[K],
  ) => setOpts({ ...opts, [key]: val });

  // Data points in ฿B for chart
  const data = projection.rows.map((r) => ({
    year: `Y${r.year}`,
    Net: +(r.net / 1e9).toFixed(2),
    Cumulative: +(r.cumulative / 1e9).toFixed(2),
    CumulativeLow: +(r.cumulativeLow / 1e9).toFixed(2),
    CumulativeHigh: +(r.cumulativeHigh / 1e9).toFixed(2),
    // For Recharts to render a band, encode [low, high] as Area "range"
    Band: [
      +(r.cumulativeLow / 1e9).toFixed(2),
      +(r.cumulativeHigh / 1e9).toFixed(2),
    ] as [number, number],
    Augmentation: +(r.augmentation / 1e9).toFixed(3),
  }));

  // Final-year engineering snapshot
  const last = projection.rows[projection.rows.length - 1];

  return (
    <div className="space-y-6">
      {/* Engineering assumptions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Engineering & financial assumptions</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                Battery degradation, EV adoption, carbon price drift
              </p>
            </div>
            <Badge tone="violet">Phase 3</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Horizon"
              value={`${opts.years} ปี`}
              hint="ระยะเวลา project"
            >
              <Slider
                value={opts.years}
                onChange={(v) => update("years", v)}
                min={5}
                max={40}
                step={1}
              />
            </Field>
            <Field
              label="Battery degradation"
              value={fmtPct(opts.batteryDegradation)}
              hint="capacity loss/ปี"
            >
              <Slider
                value={opts.batteryDegradation * 1000}
                onChange={(v) => update("batteryDegradation", v / 1000)}
                min={0}
                max={40}
                step={1}
              />
            </Field>
            <Field
              label="Carbon price ↑"
              value={fmtPct(opts.carbonPriceGrowth)}
              hint="ราคา CO₂ ขึ้น/ปี"
            >
              <Slider
                value={opts.carbonPriceGrowth * 100}
                onChange={(v) => update("carbonPriceGrowth", v / 100)}
                min={0}
                max={12}
                step={0.1}
              />
            </Field>
            <Field
              label="Carbon ± uncertainty"
              value={fmtPct(opts.carbonPriceUncertainty)}
              hint="ความผันผวนถึงปลาย horizon"
            >
              <Slider
                value={opts.carbonPriceUncertainty * 100}
                onChange={(v) => update("carbonPriceUncertainty", v / 100)}
                min={0}
                max={80}
                step={1}
              />
            </Field>
            <Field
              label="EV adoption ceiling"
              value={fmtPct(opts.evAdoptionCeiling)}
              hint="EV penetration สูงสุด"
            >
              <Slider
                value={opts.evAdoptionCeiling * 100}
                onChange={(v) => update("evAdoptionCeiling", v / 100)}
                min={20}
                max={100}
                step={1}
              />
            </Field>
            <Field
              label="EV midpoint year"
              value={`Y${opts.evAdoptionMidpoint}`}
              hint="ปีที่ EV ถึงครึ่ง ceiling"
            >
              <Slider
                value={opts.evAdoptionMidpoint}
                onChange={(v) => update("evAdoptionMidpoint", v)}
                min={1}
                max={25}
                step={1}
              />
            </Field>
            <Field
              label="OPEX inflation"
              value={fmtPct(opts.opexInflation)}
              hint="ค่าบำรุง+ค่าจ้างเฟ้อ"
            >
              <Slider
                value={opts.opexInflation * 100}
                onChange={(v) => update("opexInflation", v / 100)}
                min={0}
                max={6}
                step={0.1}
              />
            </Field>
            <Field
              label="Discount rate"
              value={fmtPct(opts.discountRate)}
              hint="0 = no discount"
            >
              <Slider
                value={opts.discountRate * 100}
                onChange={(v) => update("discountRate", v / 100)}
                min={0}
                max={15}
                step={0.25}
              />
            </Field>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]/40 p-3">
              <div>
                <p className="text-xs font-medium text-[var(--color-fg)]">
                  Battery augmentation
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">
                  เติม cells ทุกปีให้รักษา rated capacity
                </p>
              </div>
              <Switch
                checked={opts.augmentationEnabled}
                onChange={(v) => update("augmentationEnabled", v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projection KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Stat
          label="Payback year"
          value={
            projection.paybackYear
              ? `Y${projection.paybackYear}`
              : "ไม่ครอบคลุม"
          }
          tone={projection.paybackYear ? "emerald" : "rose"}
        />
        <Stat
          label={`Net Y${opts.years}`}
          value={fmtBaht(projection.totalLifetimeNet)}
          tone={projection.totalLifetimeNet > 0 ? "emerald" : "rose"}
        />
        <Stat
          label="IRR"
          value={
            Number.isFinite(projection.irrApprox)
              ? fmtPct(projection.irrApprox)
              : "—"
          }
          tone="violet"
        />
        <Stat
          label="Augmentation (total)"
          value={fmtBaht(projection.totalAugmentation)}
          tone="amber"
        />
        <Stat
          label={`EV @ Y${opts.years}`}
          value={fmtPct(last?.evPenetration ?? 0)}
          tone="sky"
        />
      </div>

      {/* Cashflow chart with uncertainty band */}
      <Card>
        <CardHeader>
          <CardTitle>Cashflow with carbon-price uncertainty</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            Bars = yearly net · line = mid cumulative · band = low/high cumulative · units: ฿B
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="band-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.2 290)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="oklch(0.7 0.2 290)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}B`}
                />
                <ReferenceLine
                  y={0}
                  stroke="var(--color-border-strong)"
                  strokeWidth={1}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    return (
                      <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/95 px-3 py-2 shadow-xl backdrop-blur-md">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                          {label}
                        </p>
                        <div className="tabular mt-1 space-y-0.5 text-[11px]">
                          <Row label="Net" value={d.Net} color="oklch(0.78 0.18 155)" />
                          <Row
                            label="Cum (mid)"
                            value={d.Cumulative}
                            color="oklch(0.7 0.2 290)"
                          />
                          <Row
                            label="Cum (low)"
                            value={d.CumulativeLow}
                            color="oklch(0.72 0.2 20)"
                          />
                          <Row
                            label="Cum (high)"
                            value={d.CumulativeHigh}
                            color="oklch(0.78 0.14 235)"
                          />
                        </div>
                      </div>
                    );
                  }}
                />
                {/* Uncertainty band — Area between low/high */}
                <Area
                  type="monotone"
                  dataKey="Band"
                  stroke="none"
                  fill="url(#band-grad)"
                  activeDot={false}
                  legendType="none"
                />
                <Bar dataKey="Net" radius={[3, 3, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.Net >= 0
                          ? "oklch(0.78 0.18 155)"
                          : "oklch(0.72 0.2 20)"
                      }
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="Cumulative"
                  stroke="oklch(0.7 0.2 290)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* EV adoption + lifestyle growth */}
      <Card>
        <CardHeader>
          <CardTitle>EV adoption & lifestyle load</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            S-curve adoption × load multiplier — drives demand growth over years
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={projection.rows.map((r) => ({
                  year: `Y${r.year}`,
                  EV: +(r.evPenetration * 100).toFixed(1),
                  Lifestyle: +r.lifestyleGWhPerDay.toFixed(2),
                  Battery: +r.batteryEffectiveGWh.toFixed(2),
                }))}
                margin={{ top: 10, right: 60, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="left"
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="var(--color-fg-subtle)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/95 px-3 py-2 shadow-xl backdrop-blur-md">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                          {label}
                        </p>
                        {payload.map((p) => (
                          <div
                            key={p.name}
                            className="flex items-center gap-2 text-[11px]"
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: p.color }}
                            />
                            <span className="text-[var(--color-fg-muted)]">
                              {p.name}
                            </span>
                            <span className="tabular font-medium text-[var(--color-fg)]">
                              {(p.value as number).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="EV"
                  stroke="oklch(0.78 0.14 235)"
                  strokeWidth={2}
                  dot={false}
                  name="EV %"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Lifestyle"
                  stroke="oklch(0.78 0.18 155)"
                  strokeWidth={2}
                  dot={false}
                  name="Lifestyle GWh/day"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Battery"
                  stroke="oklch(0.7 0.2 290)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  name="Battery effective GWh"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "amber" | "sky" | "violet";
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {label}
          </p>
          <Badge tone={tone}>•</Badge>
        </div>
        <p className="tabular mt-1 text-lg font-semibold text-[var(--color-fg)]">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      <span className="text-[var(--color-fg-muted)]">{label}</span>
      <span className="font-medium text-[var(--color-fg)]">
        ฿{value.toFixed(2)}B
      </span>
    </div>
  );
}
