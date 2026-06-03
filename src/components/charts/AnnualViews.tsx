import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useChartTheme, SERIES } from "@/lib/chartTheme";
import { GlassTooltip, SeriesRow } from "@/components/charts/ChartTooltip";
import {
  annualGrid,
  loadDurationCurve,
  netDurationCurve,
  MONTH_LABELS,
} from "@/engine/annual";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

export function AnnualViews({ inputs }: Props) {
  const theme = useChartTheme();
  const cells = useMemo(() => annualGrid(inputs), [inputs]);
  const [hover, setHover] = useState<{ m: number; h: number } | null>(null);

  // Heatmap colour scale (by net MW)
  const nets = cells.map((c) => c.net);
  const maxAbs = Math.max(1, ...nets.map((n) => Math.abs(n)));

  const cell = (m: number, h: number) => cells[m * 24 + h];

  // Duration curves (downsample to ~96 pts for the chart)
  const ndc = netDurationCurve(cells);
  const ldc = loadDurationCurve(cells);
  const N = ndc.length;
  const curve = Array.from({ length: 96 }, (_, i) => {
    const idx = Math.min(N - 1, Math.floor((i / 95) * (N - 1)));
    return {
      pct: Math.round((i / 95) * 100),
      Net: +(ndc[idx] / 1000).toFixed(2),
      Demand: +(ldc[idx] / 1000).toFixed(2),
    };
  });

  const hovered = hover ? cell(hover.m, hover.h) : null;

  return (
    <div className="space-y-6">
      {/* Calendar heatmap */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Surplus calendar — เดือน × ชั่วโมง</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                เขียว = ผลิตเกิน · แดง = ขาด (1 วันตัวแทนต่อเดือน ตามฤดู) · units: MW net
              </p>
            </div>
            <div className="flex gap-1.5">
              <Badge tone="emerald">surplus</Badge>
              <Badge tone="rose">deficit</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* hour header */}
              <div className="flex pl-10">
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="w-[3.4%] min-w-[14px] text-center text-[8px] text-[var(--color-fg-subtle)]">
                    {h % 3 === 0 ? h : ""}
                  </div>
                ))}
              </div>
              {MONTH_LABELS.map((label, m) => (
                <div key={m} className="flex items-center">
                  <div className="w-10 pr-1 text-right text-[9px] text-[var(--color-fg-subtle)]">
                    {label}
                  </div>
                  {Array.from({ length: 24 }).map((_, h) => {
                    const c = cell(m, h);
                    const t = c.net / maxAbs; // -1..1
                    const op = 0.12 + 0.8 * Math.min(1, Math.abs(t));
                    const color = c.net >= 0 ? SERIES.emerald : SERIES.rose;
                    const isHover = hover?.m === m && hover?.h === h;
                    return (
                      <div
                        key={h}
                        onMouseEnter={() => setHover({ m, h })}
                        onMouseLeave={() => setHover(null)}
                        className="m-[0.5px] h-4 w-[3.4%] min-w-[13px] rounded-[2px]"
                        style={{
                          background: `${color.slice(0, -1)} / ${op})`,
                          outline: isHover ? "1px solid var(--color-fg)" : "none",
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {hovered && (
            <p className="tabular mt-3 text-[11px] text-[var(--color-fg-muted)]">
              {MONTH_LABELS[hovered.month]} · {hovered.hour}:00 — net{" "}
              <span className={hovered.net >= 0 ? "text-[var(--color-emerald-glow)]" : "text-[var(--color-rose-glow)]"}>
                {hovered.net >= 0 ? "+" : ""}
                {(hovered.net / 1000).toFixed(2)} GW
              </span>{" "}
              (ผลิต {(hovered.supply / 1000).toFixed(1)} · ใช้ {(hovered.demand / 1000).toFixed(1)} GW)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Duration curves */}
      <Card>
        <CardHeader>
          <CardTitle>Duration curves</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            แกน X = % ของเวลา · Net เหนือ 0 = ชั่วโมงที่ผลิตเกิน · units: GW
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="ndc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.emerald} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={SERIES.emerald} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...theme.gridProps} />
                <XAxis dataKey="pct" {...theme.axisProps} tickFormatter={(v) => `${v}%`} />
                <YAxis {...theme.axisProps} tickFormatter={(v) => `${v}`} />
                <ReferenceLine y={0} stroke={theme.borderStrong} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <GlassTooltip title={`${label}% ของเวลา`}>
                        <div className="space-y-0.5">
                          {payload.map((p) => (
                            <SeriesRow key={String(p.name)} name={p.name} color={p.color} value={`${Number(p.value).toFixed(2)} GW`} />
                          ))}
                        </div>
                      </GlassTooltip>
                    );
                  }}
                />
                <Area type="monotone" dataKey="Net" stroke={SERIES.emerald} fill="url(#ndc)" strokeWidth={1.6} />
                <Area type="monotone" dataKey="Demand" stroke={SERIES.violet} fill="none" strokeWidth={1.6} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
