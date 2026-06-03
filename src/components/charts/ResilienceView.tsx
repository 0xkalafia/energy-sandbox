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
import { StatCard } from "@/components/ui/StatCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";
import { useChartTheme, SERIES } from "@/lib/chartTheme";
import { GlassTooltip, seriesTooltip } from "@/components/charts/ChartTooltip";
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
  const theme = useChartTheme();
  const [scenario, setScenario] = useState<WeatherScenario>("monsoonStreak");
  const [days, setDays] = useState(7);
  const [islanded, setIslanded] = useState(true);

  const result = useMemo(
    () =>
      simulateMultiDay(inputs, days, scenario, {
        gridLimitMW: islanded ? 0 : Infinity,
      }),
    [inputs, days, scenario, islanded],
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Resilience scenario</CardTitle>
              <p className="mt-1 max-w-md text-[11px] text-[var(--color-fg-subtle)]">
                Battery SoC carried day-to-day (real chaining). In islanded mode
                missions curtail first; a blackout (unmet) only happens when
                critical load can't be served.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                tone="rose"
                value={islanded}
                onChange={setIslanded}
                options={[
                  { value: true, label: "Islanded" },
                  { value: false, label: "Grid-backed" },
                ]}
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  Days
                </span>
                <SegmentedControl
                  value={days}
                  onChange={setDays}
                  options={[5, 7, 14, 30].map((d) => ({ value: d, label: `${d}` }))}
                />
              </div>
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
        <StatCard
          label="Lowest SoC"
          value={`${(result.lowestSoC * 100).toFixed(0)}%`}
          tone={result.lowestSoC <= inputs.batteryDoDFloor + 0.001 ? "rose" : "emerald"}
        />
        <StatCard
          label="Blackout hours"
          value={result.unmetHours.toString()}
          sub={`${result.unmetGWh.toFixed(1)} GWh critical shed`}
          tone={result.unmetHours > 0 ? "rose" : "emerald"}
        />
        <StatCard
          label="Mission curtailed"
          value={`${result.curtailedHours} hr`}
          sub={`${result.curtailedGWh.toFixed(1)} GWh deferred`}
          tone={result.curtailedHours > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label={islanded ? "Grid import" : "Grid import (total)"}
          value={`${result.importTotalGWh.toFixed(1)} GWh`}
          sub={islanded ? "islanded → no grid" : undefined}
          tone={islanded ? "violet" : result.importTotalGWh > days * 3 ? "amber" : "sky"}
        />
      </div>

      {/* Reliability indices (annualised from this stress window) */}
      {islanded && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="LOLE"
            value={`${((result.unmetHours / days) * 365).toFixed(0)} hr/ปี`}
            sub="loss-of-load expectation"
            tone={result.unmetHours > 0 ? "rose" : "emerald"}
          />
          <StatCard
            label="EUE"
            value={`${((result.unmetGWh / days) * 365).toFixed(1)} GWh/ปี`}
            sub="expected unserved energy"
            tone={result.unmetGWh > 0 ? "rose" : "emerald"}
          />
          <StatCard
            label="Curtailment"
            value={`${((result.curtailedGWh / days) * 365).toFixed(0)} GWh/ปี`}
            sub="missions deferred (annualised)"
            tone="amber"
          />
          <StatCard
            label="Critical availability"
            value={`${(100 - (result.unmetHours / (days * 24)) * 100).toFixed(2)}%`}
            sub="uptime ของ critical load"
            tone={result.unmetHours === 0 ? "emerald" : "amber"}
          />
        </div>
      )}

      {/* SoC trajectory */}
      <Card>
        <CardHeader>
          <CardTitle>Battery state of charge — continuous</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            SoC carried day-to-day (real) — floor line = DoD limit; flat at floor
            = battery exhausted
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
                    <stop offset="5%" stopColor={SERIES.battery} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={SERIES.battery} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...theme.gridProps} />
                <XAxis
                  dataKey="hour"
                  {...theme.axisProps}
                  tickFormatter={(h) => (h % 24 === 0 ? `d${h / 24}` : "")}
                />
                <YAxis
                  {...theme.axisProps}
                  domain={[0, 100]}
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
                      <GlassTooltip title={`Day ${d.day + 1} · hour ${d.hour % 24}`}>
                        <p className="tabular text-sm font-medium text-[var(--color-fg)]">
                          {d.soc}%
                        </p>
                      </GlassTooltip>
                    );
                  }}
                />
                {/* day boundary lines */}
                {Array.from({ length: days - 1 }).map((_, i) => (
                  <ReferenceLine
                    key={i}
                    x={(i + 1) * 24}
                    stroke={theme.grid}
                    strokeDasharray="2 4"
                  />
                ))}
                <ReferenceLine
                  y={inputs.batteryDoDFloor * 100}
                  stroke={SERIES.rose}
                  strokeDasharray="3 3"
                  label={{
                    value: `DoD floor ${(inputs.batteryDoDFloor * 100).toFixed(0)}%`,
                    position: "insideTopRight",
                    fill: SERIES.rose,
                    fontSize: 10,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="soc"
                  stroke={SERIES.battery}
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
                <CartesianGrid {...theme.gridProps} />
                <XAxis dataKey="day" {...theme.axisProps} />
                <YAxis {...theme.axisProps} />
                <Tooltip
                  content={seriesTooltip({
                    unit: " GWh",
                    format: (v) => v.toFixed(2),
                  })}
                />
                <Bar dataKey="Supply" fill={SERIES.emerald} radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="Demand"
                  fill="oklch(0.96 0.005 270 / 0.6)"
                  radius={[3, 3, 0, 0]}
                />
                <Bar dataKey="Net" radius={[3, 3, 0, 0]}>
                  {result.daily.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.supplyGWh - d.demandGWh >= 0 ? SERIES.sky : SERIES.rose}
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

