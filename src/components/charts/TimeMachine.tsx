import { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Slider } from "@/components/ui/Slider";
import { StatCard } from "@/components/ui/StatCard";
import { useChartTheme, SERIES } from "@/lib/chartTheme";
import { GlassTooltip, SeriesRow } from "@/components/charts/ChartTooltip";
import { fmtBaht, fmtPower } from "@/lib/utils";
import {
  END_YEAR,
  START_YEAR,
  inputsForYear,
  timeline,
} from "@/engine/timeMachine";
import { computeKPIs, simulateDay } from "@/engine/simulate";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

export function TimeMachine({ inputs }: Props) {
  const theme = useChartTheme();
  const [year, setYear] = useState(END_YEAR);

  const line = useMemo(() => timeline(inputs), [inputs]);
  const yi = useMemo(() => inputsForYear(inputs, year), [inputs, year]);
  const k = useMemo(() => computeKPIs(yi, simulateDay(yi)), [yi]);
  const genCapMW = yi.solarMW + yi.windMW + yi.biomassMW + yi.hydroMW;

  const data = line.map((p) => ({
    year: `${p.year}`,
    Capacity: +(p.capacityMW / 1000).toFixed(2),
    NetCarbon: +(p.netCarbonKt / 1000).toFixed(2), // Mt
    Surplus: +p.surplusGWhDay.toFixed(2),
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Time machine — {START_YEAR} → {END_YEAR}</CardTitle>
              <p className="mt-1 max-w-md text-[11px] text-[var(--color-fg-subtle)]">
                ลากปีเพื่อดูโครงข่ายค่อยๆ build-out จากวันนี้สู่แผน 2046 (S-curve · missions มาทีหลัง)
              </p>
            </div>
            <Badge tone="violet">ปี {year}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Slider value={year} onChange={setYear} min={START_YEAR} max={END_YEAR} step={1} />
          <div className="mt-2 flex justify-between text-[10px] text-[var(--color-fg-subtle)]">
            <span>{START_YEAR} วันนี้</span>
            <span>{END_YEAR} แผนเต็ม</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label={`Gen capacity ${year}`}
              value={fmtPower(genCapMW)}
              tone="amber"
            />
            <StatCard label="Demand" value={`${(k.yearlyDemandGWh / 1000).toFixed(2)} TWh`} tone="violet" />
            <StatCard
              label="Daily surplus"
              value={`${k.dailySurplusGWh.toFixed(1)} GWh`}
              tone={k.dailySurplusGWh >= 0 ? "sky" : "rose"}
            />
            <StatCard
              label="Net carbon"
              value={k.netCarbonTon <= 0 ? "NEGATIVE" : `+${(k.netCarbonTon / 1e6).toFixed(2)} Mt`}
              sub={`${(Math.abs(k.netCarbonTon) / 1e3).toFixed(0)} kt/ปี`}
              tone={k.netCarbonTon <= 0 ? "emerald" : "rose"}
            />
            <StatCard label="Annual value" value={fmtBaht(k.totalAnnualValue)} tone="emerald" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Build-out trajectory</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            กำลังผลิต (GW) ↑ · คาร์บอนสุทธิ (Mt) ลงสู่ติดลบ · เส้นแนวตั้ง = ปีที่เลือก
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 50, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tm-cap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.amber} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={SERIES.amber} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...theme.gridProps} />
                <XAxis dataKey="year" {...theme.axisProps} interval={3} />
                <YAxis yAxisId="cap" {...theme.axisProps} tickFormatter={(v) => `${v}`} />
                <YAxis yAxisId="co2" orientation="right" {...theme.axisProps} tickFormatter={(v) => `${v}`} />
                <ReferenceLine yAxisId="co2" y={0} stroke={theme.borderStrong} strokeDasharray="3 3" />
                <ReferenceLine yAxisId="cap" x={`${year}`} stroke="var(--color-fg-muted)" strokeDasharray="4 3" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <GlassTooltip title={label}>
                        <div className="space-y-0.5">
                          {payload.map((p) => (
                            <SeriesRow key={String(p.name)} name={p.name} color={p.color} value={`${Number(p.value).toFixed(2)}${p.name === "Capacity" ? " GW" : p.name === "NetCarbon" ? " Mt" : " GWh"}`} />
                          ))}
                        </div>
                      </GlassTooltip>
                    );
                  }}
                />
                <Area yAxisId="cap" type="monotone" dataKey="Capacity" stroke={SERIES.amber} fill="url(#tm-cap)" strokeWidth={1.6} />
                <Line yAxisId="co2" type="monotone" dataKey="NetCarbon" stroke={SERIES.emerald} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
