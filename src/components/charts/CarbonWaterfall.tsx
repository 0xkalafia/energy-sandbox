import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useChartTheme } from "@/lib/chartTheme";
import { GlassTooltip } from "@/components/charts/ChartTooltip";
import type { KPIs } from "@/data/types";

interface Props {
  kpis: KPIs;
}

// A waterfall is drawn as a BarChart where each bar has a [start, end] range.
// Recharts supports `data: [{ range: [from, to] }]` for floating bars.
export function CarbonWaterfall({ kpis }: Props) {
  const theme = useChartTheme();
  const emissions = kpis.yearlyEmissionTon;
  const captured = kpis.yearlyCaptureTon;
  const net = kpis.netCarbonTon;

  // Build cumulative ranges (in tonnes)
  const data = [
    {
      stage: "Gross emission",
      range: [0, emissions],
      delta: emissions,
      type: "emit" as const,
    },
    {
      stage: "DAC capture",
      range: [Math.max(net, 0), emissions],
      delta: -captured,
      type: "capture" as const,
    },
    {
      stage: "Net",
      range: net >= 0 ? [0, net] : [net, 0],
      delta: net,
      type: net <= 0 ? "negative" : "positive",
    },
  ];

  const max = Math.max(emissions, Math.abs(net) + 100_000);
  const min = Math.min(net - 50_000, 0);

  const COLOR: Record<string, string> = {
    emit: "oklch(0.72 0.2 20)", // rose
    capture: "oklch(0.78 0.18 155)", // emerald
    negative: "oklch(0.78 0.14 235)", // sky (good!)
    positive: "oklch(0.83 0.17 75)", // amber (warning)
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Carbon balance (annual)</CardTitle>
            <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
              Gross emission → DAC capture → Net (units: tonne CO₂/year)
            </p>
          </div>
          <Badge tone={net <= 0 ? "emerald" : "amber"}>
            {net <= 0 ? "NET NEGATIVE" : "STILL POSITIVE"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 16, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid {...theme.gridProps} />
              <XAxis
                dataKey="stage"
                {...theme.axisProps}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                {...theme.axisProps}
                domain={[min, max]}
                tickFormatter={(v) =>
                  Math.abs(v) >= 1e6
                    ? `${(v / 1e6).toFixed(1)}M`
                    : Math.abs(v) >= 1e3
                      ? `${(v / 1e3).toFixed(0)}k`
                      : v.toString()
                }
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <GlassTooltip title={label}>
                      <p className="tabular text-sm font-medium text-[var(--color-fg)]">
                        {d.delta >= 0 ? "+" : ""}
                        {d.delta.toLocaleString()} tCO₂
                      </p>
                    </GlassTooltip>
                  );
                }}
              />
              <Bar dataKey="range" radius={[6, 6, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={COLOR[d.type]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stat row beneath the chart */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Stat label="Emitted" value={emissions} tone="rose" />
          <Stat label="Captured by DAC" value={-captured} tone="emerald" />
          <Stat label="Net" value={net} tone={net <= 0 ? "sky" : "amber"} />
        </div>
      </CardContent>
    </Card>
  );
}

type StatTone = "rose" | "emerald" | "sky" | "amber";

const STAT_COLOR: Record<StatTone, string> = {
  rose: "var(--color-rose-glow)",
  emerald: "var(--color-emerald-glow)",
  sky: "var(--color-sky-glow)",
  amber: "var(--color-amber-glow)",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: StatTone;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]/40 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <p
        className="tabular mt-1 text-sm font-semibold"
        style={{ color: STAT_COLOR[tone] }}
      >
        {value >= 0 ? "+" : ""}
        {(value / 1000).toFixed(0)}k tCO₂
      </p>
    </div>
  );
}
