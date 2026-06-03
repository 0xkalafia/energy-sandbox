import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Slider } from "@/components/ui/Slider";
import { StatCard } from "@/components/ui/StatCard";
import { useChartTheme, SERIES } from "@/lib/chartTheme";
import { GlassTooltip, SeriesRow } from "@/components/charts/ChartTooltip";
import { cn } from "@/lib/utils";
import {
  computeSensitivity,
  METRIC_META,
  type SensMetric,
} from "@/engine/sensitivity";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

const METRICS: { id: SensMetric; label: string }[] = [
  { id: "payback", label: "Payback" },
  { id: "annualValue", label: "Annual value" },
  { id: "netCarbon", label: "Net carbon" },
];

export function SensitivityTornado({ inputs }: Props) {
  const theme = useChartTheme();
  const [metric, setMetric] = useState<SensMetric>("payback");
  const [pct, setPct] = useState(0.2);

  const { base, rows } = useMemo(
    () => computeSensitivity(inputs, metric, pct),
    [inputs, metric, pct],
  );

  const meta = METRIC_META[metric];
  const fmt = (v: number) =>
    metric === "annualValue"
      ? `฿${v.toFixed(1)}B`
      : `${v.toFixed(metric === "payback" ? 1 : 0)}${meta.unit}`;

  // Recharts floating bars: encode [from, to] spanning low↔high around base.
  const data = rows.map((r) => ({
    label: r.label,
    range: [Math.min(r.low, r.high), Math.max(r.low, r.high)] as [number, number],
    low: r.low,
    high: r.high,
    swing: r.swing,
    // colour by whether increasing the input helps or hurts the metric
    helpfulUp: meta.lowerIsBetter ? r.high < r.low : r.high > r.low,
  }));

  const topDriver = rows[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Sensitivity tornado</CardTitle>
              <p className="mt-1 max-w-md text-[11px] text-[var(--color-fg-subtle)]">
                Each input swept ±{Math.round(pct * 100)}% one at a time. Longest
                bar = biggest lever on {meta.label.toLowerCase()}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                {METRICS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMetric(m.id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px]",
                      metric === m.id
                        ? "border-[var(--color-emerald-glow)]/40 bg-[var(--color-emerald-glow)]/10 text-[var(--color-fg)]"
                        : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)]",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="w-36">
                <Field label="Sweep ±" value={`${Math.round(pct * 100)}%`}>
                  <Slider
                    value={pct * 100}
                    onChange={(v) => setPct(v / 100)}
                    min={5}
                    max={50}
                    step={5}
                  />
                </Field>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="w-full"
            style={{ height: Math.max(220, data.length * 34 + 40) }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <XAxis
                  type="number"
                  {...theme.axisProps}
                  tickFormatter={(v) => fmt(v)}
                  domain={["dataMin", "dataMax"]}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  {...theme.axisProps}
                  width={110}
                  tick={{ fontSize: 11 }}
                />
                <ReferenceLine
                  x={base}
                  stroke={theme.borderStrong}
                  strokeDasharray="4 3"
                  label={{
                    value: `base ${fmt(base)}`,
                    position: "top",
                    fill: "var(--color-fg-muted)",
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-bg-hover)", opacity: 0.3 }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0].payload as (typeof data)[number];
                    return (
                      <GlassTooltip title={d.label}>
                        <div className="space-y-0.5">
                          <SeriesRow name={`−${Math.round(pct * 100)}%`} color={SERIES.rose} value={fmt(d.low)} />
                          <SeriesRow name={`+${Math.round(pct * 100)}%`} color={SERIES.emerald} value={fmt(d.high)} />
                          <SeriesRow name="swing" value={fmt(d.swing)} />
                        </div>
                      </GlassTooltip>
                    );
                  }}
                />
                <Bar dataKey="range" radius={[4, 4, 4, 4]} barSize={18}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.helpfulUp ? SERIES.emerald : SERIES.sky} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {topDriver && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard
            label="Biggest lever"
            value={topDriver.label}
            sub={`swing ${fmt(topDriver.swing)}`}
            tone="emerald"
          />
          <StatCard
            label={`Base ${meta.label}`}
            value={fmt(base)}
            tone="violet"
          />
          <StatCard
            label="Inputs tested"
            value={`${rows.length}`}
            sub={`±${Math.round(pct * 100)}% each`}
            tone="sky"
          />
        </div>
      )}
    </div>
  );
}
