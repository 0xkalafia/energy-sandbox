import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  WEATHER_SCENARIOS,
  simulateMultiDay,
  type WeatherScenario,
} from "@/engine/multiDay";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

export function ResilienceView({ inputs }: Props) {
  const [scenario, setScenario] = useState<WeatherScenario>("monsoonStreak");
  const [days, setDays] = useState(7);

  const result = useMemo(
    () => simulateMultiDay(inputs, days, scenario),
    [inputs, days, scenario],
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Resilience scenario</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                Run engine across consecutive days — battery state visually
                stitches across boundaries
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                Days
              </span>
              {[5, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={cn(
                    "tabular rounded-md border px-2 py-1 text-[11px]",
                    days === d
                      ? "border-[var(--color-emerald-glow)]/40 bg-[var(--color-emerald-glow)]/10 text-[var(--color-fg)]"
                      : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)]",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {WEATHER_SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenario(s.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-all",
                  scenario === s.id
                    ? "border-[var(--color-emerald-glow)]/50 bg-[var(--color-emerald-glow)]/10"
                    : "border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]",
                )}
              >
                <p className="text-sm font-medium text-[var(--color-fg)]">
                  {s.label}
                </p>
                <p className="mt-1 text-[10px] leading-snug text-[var(--color-fg-subtle)]">
                  {s.description}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Resilience KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIBox
          label="Lowest SoC"
          value={`${(result.lowestSoC * 100).toFixed(0)}%`}
          tone={result.lowestSoC < 0.15 ? "rose" : "emerald"}
        />
        <KPIBox
          label="Unmet hours"
          value={result.unmetHours.toString()}
          tone={result.unmetHours > 0 ? "rose" : "emerald"}
        />
        <KPIBox
          label="Grid import (total)"
          value={`${result.importTotalGWh.toFixed(1)} GWh`}
          tone={result.importTotalGWh > days * 3 ? "amber" : "sky"}
        />
        <KPIBox
          label="Days simulated"
          value={`${days} วัน`}
          tone="violet"
        />
      </div>

      {/* SoC trajectory */}
      <Card>
        <CardHeader>
          <CardTitle>Battery state of charge — continuous</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            SoC stitched across day boundaries — red zone = below DoD floor
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={result.hourly.map((h) => ({
                  hour: h.globalHour,
                  day: h.day,
                  soc: +(h.batterySoC * 100).toFixed(2),
                }))}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="soc-multi" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="oklch(0.7 0.2 290)"
                      stopOpacity={0.5}
                    />
                    <stop
                      offset="95%"
                      stopColor="oklch(0.7 0.2 290)"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
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
                  tickFormatter={(h) => (h % 24 === 0 ? `d${h / 24}` : "")}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="oklch(0.5 0.01 270)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0].payload as {
                      hour: number;
                      day: number;
                      soc: number;
                    };
                    return (
                      <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/95 px-3 py-2 shadow-xl backdrop-blur-md">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                          Day {d.day + 1} · hour {d.hour % 24}
                        </p>
                        <p className="tabular mt-1 text-sm font-medium text-[var(--color-fg)]">
                          {d.soc}%
                        </p>
                      </div>
                    );
                  }}
                />
                {/* day boundary lines */}
                {Array.from({ length: days - 1 }).map((_, i) => (
                  <ReferenceLine
                    key={i}
                    x={(i + 1) * 24}
                    stroke="oklch(0.28 0.008 270)"
                    strokeDasharray="2 4"
                  />
                ))}
                <ReferenceLine
                  y={inputs.batteryDoDFloor * 100}
                  stroke="oklch(0.72 0.2 20)"
                  strokeDasharray="3 3"
                  label={{
                    value: `DoD floor ${(inputs.batteryDoDFloor * 100).toFixed(0)}%`,
                    position: "insideTopRight",
                    fill: "oklch(0.72 0.2 20)",
                    fontSize: 10,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="soc"
                  stroke="oklch(0.7 0.2 290)"
                  fill="url(#soc-multi)"
                  strokeWidth={1.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Per-day supply / demand */}
      <Card>
        <CardHeader>
          <CardTitle>Daily supply vs demand</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            Bars per day — surplus days vs deficit days at a glance
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={result.daily.map((d) => ({
                  day: `d${d.day + 1}`,
                  Supply: +d.supplyGWh.toFixed(2),
                  Demand: +d.demandGWh.toFixed(2),
                  Net: +(d.supplyGWh - d.demandGWh).toFixed(2),
                  season: d.season,
                }))}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.28 0.008 270)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
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
                              {(p.value as number).toFixed(2)} GWh
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="Supply" fill="oklch(0.78 0.18 155)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Demand" fill="oklch(0.96 0.005 270 / 0.6)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Net" radius={[3, 3, 0, 0]}>
                  {result.daily.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.supplyGWh - d.demandGWh >= 0
                          ? "oklch(0.78 0.14 235)"
                          : "oklch(0.72 0.2 20)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KPIBox({
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
