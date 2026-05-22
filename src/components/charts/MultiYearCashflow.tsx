import { useMemo, useState } from "react";
import {
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
import { fmtBaht, fmtPct } from "@/lib/utils";
import type { KPIs } from "@/data/types";
import {
  DEFAULT_MULTI_YEAR,
  projectMultiYear,
  type MultiYearOptions,
} from "@/engine/multiYear";

interface Props {
  kpis: KPIs;
}

export function MultiYearCashflow({ kpis }: Props) {
  const [opts, setOpts] = useState<MultiYearOptions>(DEFAULT_MULTI_YEAR);

  const projection = useMemo(() => projectMultiYear(kpis, opts), [kpis, opts]);

  const update = <K extends keyof MultiYearOptions>(
    key: K,
    val: MultiYearOptions[K],
  ) => setOpts({ ...opts, [key]: val });

  const data = projection.rows.map((r) => ({
    year: `Y${r.year}`,
    Net: +(r.net / 1e9).toFixed(2), // billion baht
    Cumulative: +(r.cumulative / 1e9).toFixed(2),
  }));

  return (
    <div className="space-y-6">
      {/* Assumptions controls */}
      <Card>
        <CardHeader>
          <CardTitle>Projection assumptions</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            Adjust to see how growth and inflation reshape payback
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Horizon"
              value={`${opts.years} ปี`}
              hint="ปีที่ project ไปข้างหน้า"
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
              label="Demand growth"
              value={fmtPct(opts.demandGrowth)}
              hint="โหลดเพิ่ม/ปี"
            >
              <Slider
                value={opts.demandGrowth * 100}
                onChange={(v) => update("demandGrowth", v / 100)}
                min={0}
                max={5}
                step={0.1}
              />
            </Field>
            <Field
              label="Carbon price ↑"
              value={fmtPct(opts.carbonPriceGrowth)}
              hint="ราคาคาร์บอนเครดิตขึ้น/ปี"
            >
              <Slider
                value={opts.carbonPriceGrowth * 100}
                onChange={(v) => update("carbonPriceGrowth", v / 100)}
                min={0}
                max={10}
                step={0.1}
              />
            </Field>
            <Field
              label="OPEX inflation"
              value={fmtPct(opts.opexInflation)}
              hint="ค่าบำรุง/ค่าจ้างเฟ้อ"
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
              hint="NPV discount (0 = ไม่ใช้)"
              className="sm:col-span-2"
            >
              <Slider
                value={opts.discountRate * 100}
                onChange={(v) => update("discountRate", v / 100)}
                min={0}
                max={15}
                step={0.25}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Projection KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          label={`Net after ${opts.years} ปี`}
          value={fmtBaht(projection.totalLifetimeNet)}
          tone={projection.totalLifetimeNet > 0 ? "emerald" : "rose"}
        />
        <Stat
          label="IRR (approx)"
          value={
            Number.isFinite(projection.irrApprox)
              ? fmtPct(projection.irrApprox)
              : "—"
          }
          tone="violet"
        />
        <Stat label="CAPEX" value={fmtBaht(kpis.capexEstimate)} tone="amber" />
      </div>

      {/* Cashflow chart */}
      <Card>
        <CardHeader>
          <CardTitle>Annual net & cumulative cashflow</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            Bars = yearly net · line = cumulative (starts at −CAPEX) · units: ฿B
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.28 0.008 270)"
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  stroke="oklch(0.5 0.01 270)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="oklch(0.5 0.01 270)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}B`}
                />
                <ReferenceLine
                  y={0}
                  stroke="oklch(0.36 0.01 270)"
                  strokeWidth={1}
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
                              ฿{(p.value as number).toFixed(2)}B
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
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
