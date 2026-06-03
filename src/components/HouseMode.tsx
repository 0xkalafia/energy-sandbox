import { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
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
import { StatCard } from "@/components/ui/StatCard";
import { useChartTheme, SERIES } from "@/lib/chartTheme";
import { GlassTooltip, SeriesRow } from "@/components/charts/ChartTooltip";
import { cn, fmtPct } from "@/lib/utils";
import { Home } from "lucide-react";
import { DEFAULT_HOUSE, simulateHouse, type HouseInputs } from "@/engine/house";

export function HouseMode() {
  const theme = useChartTheme();
  const [h, setH] = useState<HouseInputs>(DEFAULT_HOUSE);
  const r = useMemo(() => simulateHouse(h), [h]);

  const set = <K extends keyof HouseInputs>(k: K, v: HouseInputs[K]) =>
    setH({ ...h, [k]: v });

  const baht = (v: number) => `฿${Math.round(v).toLocaleString()}`;

  const chart = r.hourly.map((p) => ({
    hour: `${p.hour.toString().padStart(2, "0")}`,
    Solar: +p.solar.toFixed(2),
    Load: +p.load.toFixed(2),
    SoC: +(p.soc * 100).toFixed(0),
  }));

  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-[var(--color-emerald-glow)]" />
              <div>
                <CardTitle>My House — บ้านเพชรบุรี</CardTitle>
                <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                  Engine เดียวกัน สเกลบ้าน (kWh) — โซลาร์ {(h.solarW / 1000).toFixed(2)} kW · หลังคา N+S · CF {h.capacityFactor}
                </p>
              </div>
            </div>
            <Badge tone="emerald">residential</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Solar" value={`${h.solarW} W`} hint="4,380 ปัจจุบัน / 5,840 แผน">
              <Slider value={h.solarW} onChange={(v) => set("solarW", v)} min={1000} max={10000} step={100} />
            </Field>
            <Field label="ใช้ไฟ (occupancy)" value={fmtPct(h.occupancy)} hint="40% = อยู่ 2 คน · 100% = พร้อมหน้า">
              <Slider value={h.occupancy * 100} onChange={(v) => set("occupancy", v / 100)} min={20} max={100} step={5} />
            </Field>
            <Field label="Battery" value={`${h.batteryKWh} kWh`} hint="0 = ไม่มีแบต">
              <Slider value={h.batteryKWh} onChange={(v) => set("batteryKWh", v)} min={0} max={40} step={1} />
            </Field>
            <Field label="CF (มุมหลังคา)" value={`${h.capacityFactor}`} hint="N+S = 0.13">
              <Slider value={h.capacityFactor * 100} onChange={(v) => set("capacityFactor", v / 100)} min={10} max={20} step={1} />
            </Field>
            <Field label="ค่าไฟ/เดือน (full)" value={baht(h.monthlyBill)}>
              <Slider value={h.monthlyBill} onChange={(v) => set("monthlyBill", v)} min={1000} max={6000} step={100} />
            </Field>
            <Field label="ค่าไฟ ฿/หน่วย" value={`${h.tariff}`}>
              <Slider value={h.tariff * 10} onChange={(v) => set("tariff", v / 10)} min={30} max={60} step={1} />
            </Field>
            <Field label="ราคาแบต ฿/kWh" value={baht(h.batteryPricePerKWh)} hint="อนาคต ~525">
              <Slider value={h.batteryPricePerKWh} onChange={(v) => set("batteryPricePerKWh", v)} min={300} max={15000} step={100} />
            </Field>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]/40 p-3">
              <div>
                <p className="text-xs font-medium text-[var(--color-fg)]">ชาร์จ Neta V</p>
                <p className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">
                  {h.evOn ? `${h.evKWhPerDay} kWh/วัน (~${Math.round(h.evKWhPerDay * 6.5)} กม.)` : "ปิด"}
                </p>
              </div>
              <Switch checked={h.evOn} onChange={(v) => set("evOn", v)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Self-sufficiency" value={fmtPct(r.selfSufficiency)} sub="โหลดที่ไม่ง้อ grid" tone={r.selfSufficiency > 0.8 ? "emerald" : "amber"} />
        <StatCard label="Self-consumption" value={fmtPct(r.selfConsumption)} sub="โซลาร์ใช้เอง" tone="sky" />
        <StatCard label="ประหยัด/เดือน" value={baht(r.monthlySaving)} sub={`จาก ${baht(r.billNoSolar)}`} tone="emerald" />
        <StatCard
          label="แบตคืนทุน"
          value={h.batteryKWh > 0 ? `${r.batteryPaybackYears.toFixed(1)} ปี` : "—"}
          sub={h.batteryKWh > 0 ? baht(r.batteryCost) : "ไม่มีแบต"}
          tone={r.batteryPaybackYears > 0 && r.batteryPaybackYears < 8 ? "emerald" : "amber"}
        />
        <StatCard label="Off-grid" value={`${r.offGridHours.toFixed(0)} ชม.`} sub="แบตเลี้ยงคืนเดียว" tone="violet" />
        <StatCard label="ลด CO₂" value={`${(r.co2AvoidedKgYear / 1000).toFixed(1)} t/ปี`} tone="emerald" />
      </div>

      {/* 24h chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>วันทั่วไป — โซลาร์ vs โหลด + แบต</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                ผลิต {r.solarKWhDay.toFixed(1)} · ใช้ {r.loadKWhDay.toFixed(1)} · ซื้อ {r.importKWhDay.toFixed(1)} · ขาย {r.exportKWhDay.toFixed(1)} kWh/วัน
              </p>
            </div>
            <div className="flex gap-1.5">
              <Badge tone="amber">Solar</Badge>
              <Badge tone="neutral">Load</Badge>
              <Badge tone="violet">SoC</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 10, right: 50, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="house-solar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.solar} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={SERIES.solar} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...theme.gridProps} />
                <XAxis dataKey="hour" {...theme.axisProps} />
                <YAxis yAxisId="kw" {...theme.axisProps} tickFormatter={(v) => `${v}`} />
                <YAxis yAxisId="soc" orientation="right" domain={[0, 100]} {...theme.axisProps} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <GlassTooltip title={`${label}:00`}>
                        <div className="space-y-0.5">
                          {payload.map((p) => (
                            <SeriesRow
                              key={String(p.name)}
                              name={p.name}
                              color={p.color}
                              value={`${Number(p.value).toFixed(p.name === "SoC" ? 0 : 2)}${p.name === "SoC" ? "%" : " kW"}`}
                            />
                          ))}
                        </div>
                      </GlassTooltip>
                    );
                  }}
                />
                <Area yAxisId="kw" type="monotone" dataKey="Solar" stroke={SERIES.solar} fill="url(#house-solar)" strokeWidth={1.5} />
                <Line yAxisId="kw" type="monotone" dataKey="Load" stroke="var(--color-fg)" strokeWidth={2} dot={false} />
                <Line yAxisId="soc" type="monotone" dataKey="SoC" stroke={SERIES.battery} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "ตอนนี้ (4,380W, 2 คน, ไม่มีแบต)", p: { solarW: 4380, occupancy: 0.4, batteryKWh: 0 } },
          { label: "แผนขยาย (5,840W + แบต 10kWh)", p: { solarW: 5840, occupancy: 0.4, batteryKWh: 10 } },
          { label: "พร้อมหน้า full load", p: { occupancy: 1 } },
          { label: "Off-grid ลอง (แบต 18.5kWh)", p: { batteryKWh: 18.5, occupancy: 1 } },
        ].map((b) => (
          <button
            key={b.label}
            onClick={() => setH({ ...h, ...b.p })}
            className={cn(
              "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-fg-muted)]",
              "hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
