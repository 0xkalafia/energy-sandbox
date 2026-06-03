import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { SERIES } from "@/lib/chartTheme";
import { fmtPower } from "@/lib/utils";
import { allocate, type DistrictAlloc } from "@/data/districts";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

type Resource = "solar" | "wind" | "hydro" | "mission";
const RES_COLOR: Record<Resource, string> = {
  solar: SERIES.solar,
  wind: SERIES.sky,
  hydro: "oklch(0.72 0.15 200)",
  mission: SERIES.violet,
};

function dominant(a: DistrictAlloc): Resource {
  const scores: Record<Resource, number> = {
    solar: a.solarMW,
    wind: a.windMW,
    hydro: a.hydroMW * 5, // hydro MW is tiny but signifies the dam
    mission: a.missionGWhDay * 100,
  };
  return (Object.entries(scores).sort((x, y) => y[1] - x[1])[0][0] as Resource);
}

export function SpatialMap({ inputs }: Props) {
  const alloc = useMemo(() => allocate(inputs), [inputs]);
  const [selected, setSelected] = useState<string>("mueang");

  const maxCap = Math.max(...alloc.map((a) => a.capacityMW), 1);
  const sel = alloc.find((a) => a.d.id === selected) ?? alloc[0];

  // Load hub for transmission lines = เมือง
  const hub = alloc.find((a) => a.d.id === "mueang")!;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Distributed grid — 8 อำเภอ</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                Schematic (ไม่ใช่สเกลจริง) · ทะเลฝั่งตะวันออก · เขื่อน/ภูเขาฝั่งตะวันตก · กดเลือกอำเภอ
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="amber">Solar</Badge>
              <Badge tone="sky">Wind</Badge>
              <Badge tone="violet">Mission</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* Map */}
            <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <svg viewBox="0 0 100 112" className="h-full max-h-[460px] w-full">
                {/* Gulf coast (east) */}
                <defs>
                  <linearGradient id="sea" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="oklch(0.6 0.1 230 / 0)" />
                    <stop offset="100%" stopColor="oklch(0.6 0.12 230 / 0.28)" />
                  </linearGradient>
                  <linearGradient id="mtn" x1="1" y1="0" x2="0" y2="0">
                    <stop offset="0%" stopColor="oklch(0.6 0.08 150 / 0)" />
                    <stop offset="100%" stopColor="oklch(0.6 0.08 150 / 0.18)" />
                  </linearGradient>
                </defs>
                <path d="M88 0 Q 94 30 90 56 Q 86 84 95 112 L 100 112 L 100 0 Z" fill="url(#sea)" />
                <text x="96" y="60" fontSize="3" fill="var(--color-fg-subtle)" textAnchor="middle" transform="rotate(90 96 60)">อ่าวไทย</text>
                {/* Mountains (west) */}
                <path d="M0 0 L 10 0 Q 6 50 12 112 L 0 112 Z" fill="url(#mtn)" />

                {/* Transmission lines from each gen district to the hub */}
                {alloc.map((a) =>
                  a.d.id === hub.d.id ? null : (
                    <line
                      key={`l-${a.d.id}`}
                      x1={a.d.x}
                      y1={a.d.y + 6}
                      x2={hub.d.x}
                      y2={hub.d.y + 6}
                      stroke="var(--color-border)"
                      strokeWidth={0.4}
                      strokeDasharray="1.5 1.5"
                      opacity={0.5}
                    />
                  ),
                )}

                {/* District nodes */}
                {alloc.map((a) => {
                  const r = 3.2 + 5.5 * Math.sqrt(a.capacityMW / maxCap);
                  const res = dominant(a);
                  const isSel = a.d.id === selected;
                  return (
                    <g
                      key={a.d.id}
                      transform={`translate(${a.d.x} ${a.d.y})`}
                      className="cursor-pointer"
                      onClick={() => setSelected(a.d.id)}
                    >
                      {a.batteryGWh > 0.3 && (
                        <circle r={r + 1.6} fill="none" stroke={SERIES.battery} strokeWidth={0.6} opacity={0.7} />
                      )}
                      <circle
                        r={r}
                        fill={RES_COLOR[res]}
                        fillOpacity={isSel ? 0.95 : 0.6}
                        stroke={isSel ? "var(--color-fg)" : "var(--color-bg)"}
                        strokeWidth={isSel ? 0.9 : 0.5}
                      />
                      <text y={r + 3.4} fontSize="2.9" fill="var(--color-fg)" textAnchor="middle" fontWeight={isSel ? 700 : 500}>
                        {a.d.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Selected district detail */}
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-hover)]/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-fg)]">{sel.d.name}</p>
                    <p className="text-[11px] text-[var(--color-fg-subtle)]">{sel.d.en} · {sel.d.role}</p>
                  </div>
                  {sel.d.coastal && <Badge tone="sky">ชายฝั่ง</Badge>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <Metric label="Solar" value={fmtPower(sel.solarMW)} color={SERIES.solar} />
                  <Metric label="Wind" value={fmtPower(sel.windMW)} color={SERIES.sky} />
                  <Metric label="Hydro" value={fmtPower(sel.hydroMW)} color="oklch(0.72 0.15 200)" />
                  <Metric label="Battery" value={`${sel.batteryGWh.toFixed(1)} GWh`} color={SERIES.battery} />
                  <Metric label="Missions" value={`${sel.missionGWhDay.toFixed(2)} GWh/d`} color={SERIES.violet} />
                  <Metric label="Gen (est)" value={`${sel.genGWhDay.toFixed(2)} GWh/d`} color={SERIES.emerald} />
                </div>
              </div>
              <p className="px-1 text-[10px] text-[var(--color-fg-subtle)]">
                การจัดสรรอิงน้ำหนักตามบทบาทแต่ละอำเภอ (Gemini distributed plan) ปรับ
                slider ฝั่งซ้ายแล้วตัวเลขกระจายตามจริง
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Province totals from the allocation */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Districts" value="8 อำเภอ" tone="violet" />
        <StatCard
          label="Solar spread"
          value={fmtPower(alloc.reduce((s, a) => s + a.solarMW, 0))}
          sub="กระจายทุกอำเภอ"
          tone="amber"
        />
        <StatCard
          label="Battery spread"
          value={`${alloc.reduce((s, a) => s + a.batteryGWh, 0).toFixed(1)} GWh`}
          tone="violet"
        />
        <StatCard
          label="ทะเล (desal/ลม)"
          value={`${alloc.filter((a) => a.d.coastal).length} อำเภอ`}
          sub="บ้านแหลม · เมือง · ชะอำ"
          tone="sky"
        />
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-[var(--color-fg-muted)]">{label}</span>
      <span className="tabular ml-auto font-medium text-[var(--color-fg)]">{value}</span>
    </div>
  );
}
