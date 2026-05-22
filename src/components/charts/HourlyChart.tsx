import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SOURCE_COLORS } from "@/data/constants";
import type { HourlyPoint } from "@/data/types";

interface Props {
  hourly: HourlyPoint[];
}

export function HourlyChart({ hourly }: Props) {
  const data = hourly.map((h) => ({
    hour: `${h.hour.toString().padStart(2, "0")}:00`,
    Solar: Math.round(h.solar),
    Wind: Math.round(h.wind),
    Biomass: Math.round(h.biomass),
    Hydro: Math.round(h.hydro),
    Demand: Math.round(h.totalDemand),
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>กำลังผลิต vs ความต้องการ (24 ชม.)</CardTitle>
            <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
              Stacked sources vs demand line — units: MW
            </p>
          </div>
          <div className="flex gap-1.5">
            <Badge tone="amber">Solar</Badge>
            <Badge tone="sky">Wind</Badge>
            <Badge tone="emerald">Biomass</Badge>
            <Badge tone="violet">Hydro</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                {Object.entries({
                  solar: SOURCE_COLORS.solar,
                  wind: SOURCE_COLORS.wind,
                  biomass: SOURCE_COLORS.biomass,
                  hydro: SOURCE_COLORS.hydro,
                }).map(([k, c]) => (
                  <linearGradient
                    key={k}
                    id={`grad-${k}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={c} stopOpacity={0.7} />
                    <stop offset="95%" stopColor={c} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(0.28 0.008 270)"
                vertical={false}
              />
              <XAxis
                dataKey="hour"
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
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString()
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="Biomass"
                stackId="supply"
                stroke={SOURCE_COLORS.biomass}
                fill="url(#grad-biomass)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="Hydro"
                stackId="supply"
                stroke={SOURCE_COLORS.hydro}
                fill="url(#grad-hydro)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="Wind"
                stackId="supply"
                stroke={SOURCE_COLORS.wind}
                fill="url(#grad-wind)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="Solar"
                stackId="supply"
                stroke={SOURCE_COLORS.solar}
                fill="url(#grad-solar)"
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="Demand"
                stroke={SOURCE_COLORS.demand}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/95 px-3 py-2 shadow-xl backdrop-blur-md">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <div className="mt-1 space-y-0.5">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-[11px]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-[var(--color-fg-muted)]">{p.name}</span>
            <span className="tabular font-medium text-[var(--color-fg)]">
              {p.value.toLocaleString()} MW
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
