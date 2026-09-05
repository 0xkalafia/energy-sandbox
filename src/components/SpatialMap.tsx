import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SERIES } from "@/lib/chartTheme";
import { fmtPower } from "@/lib/utils";
import { allocate, type DistrictAlloc } from "@/data/districts";
import {
  DISTRICT_GEO,
  GEO_VIEWBOX,
  PARK_PATH,
  RESERVOIR_PATH,
} from "@/data/districtGeo";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

/**
 * Two ways to shade the same map, and they disagree.
 *
 * By total, Kaeng Krachan and Nong Ya Plong lead almost whatever the sliders
 * say — together they are 62% of the province, so they collect the most of
 * anything spread by area. By density the small districts come forward, which
 * is the honest answer to "where is this actually concentrated". Neither is
 * wrong; showing only one is.
 */
type Metric = "total" | "density";
const METRICS: { value: Metric; label: string }[] = [
  { value: "total", label: "ยอดรวม" },
  { value: "density", label: "ต่อ km²" },
];

/**
 * Shade across the observed range rather than from zero.
 *
 * Measured on the default scenario, totals run 990 to 1,910 MW — every
 * district between half and full, which as a fill from zero is eight
 * near-identical shapes. Density runs 0.59 to 6.03 MW/km², a tenfold spread.
 * Anchoring the ramp to min and max makes both readable; the legend prints the
 * two ends so nobody reads the darkest patch as an absolute.
 */
function ramp(value: number, min: number, max: number): number {
  const t = max - min < 1e-9 ? 0.5 : (value - min) / (max - min);
  return 0.14 + 0.72 * t;
}

const GEO_BY_ID = Object.fromEntries(DISTRICT_GEO.map((g) => [g.id, g]));

export function SpatialMap({ inputs }: Props) {
  const alloc = useMemo(() => allocate(inputs), [inputs]);
  const [selected, setSelected] = useState<string>("mueang");
  const [metric, setMetric] = useState<Metric>("total");

  const valueOf = (a: DistrictAlloc) =>
    metric === "total" ? a.capacityMW : a.capacityMWPerKm2;
  const values = alloc.map(valueOf);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const fmtValue = (v: number) =>
    metric === "total" ? `${Math.round(v)} MW` : `${v.toFixed(2)} MW/km²`;

  const sel = alloc.find((a) => a.d.id === selected) ?? alloc[0];
  const hub = alloc.find((a) => a.d.id === "mueang")!;
  const hubGeo = GEO_BY_ID.mueang;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Distributed grid — 8 อำเภอ</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                ขอบเขตอำเภอจริง · เขื่อนแก่งกระจานและเขตอุทยานคือเหตุผลที่ 42%
                ของจังหวัดปูแผงไม่ได้ · กดเลือกอำเภอ
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                value={metric}
                onChange={setMetric}
                options={METRICS}
              />
              {/* The ramp is anchored to this scenario's own min and max, so
                  the ends have to be printed or the shading means nothing. */}
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-fg-subtle)]">
                <span className="tabular">{fmtValue(minValue)}</span>
                <span className="flex h-3 w-16 overflow-hidden rounded-sm border border-[var(--color-border)]">
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <span
                      key={t}
                      className="flex-1"
                      style={{ background: SERIES.solar, opacity: 0.14 + 0.72 * t }}
                    />
                  ))}
                </span>
                <span className="tabular">{fmtValue(maxValue)}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <svg
                viewBox={`0 0 ${GEO_VIEWBOX.width} ${GEO_VIEWBOX.height}`}
                className="h-full max-h-[520px] w-full"
                // Not role="img": that promises no interactive descendants,
                // and every district in here is a button. A group holding
                // eight controls is what this actually is.
                role="group"
                aria-label="แผนที่เพชรบุรี 8 อำเภอ พร้อมกำลังผลิตที่จัดสรรในแต่ละอำเภอ"
              >
                <defs>
                  {/* The park runs past the province line, so clip it to the
                      districts rather than drawing a lobe into the sea. */}
                  <clipPath id="province-clip">
                    {DISTRICT_GEO.map((g) => (
                      <path key={g.id} d={g.path} />
                    ))}
                  </clipPath>
                </defs>

                <path
                  d={PARK_PATH}
                  clipPath="url(#province-clip)"
                  fill={SERIES.emerald}
                  fillOpacity={0.1}
                />

                {alloc.map((a) => {
                  const geo = GEO_BY_ID[a.d.id];
                  if (!geo) return null;
                  const isSel = a.d.id === selected;
                  return (
                    <g
                      key={a.d.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${a.d.name} ${a.d.en} ${Math.round(a.capacityMW)} เมกะวัตต์ พื้นที่ ${a.km2} ตารางกิโลเมตร`}
                      aria-pressed={isSel}
                      className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-emerald-glow)]"
                      onClick={() => setSelected(a.d.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(a.d.id);
                        }
                      }}
                    >
                      <path
                        d={geo.path}
                        // One variable, one channel: shade is the metric.
                        // Hue used to mean "dominant resource", which sounds
                        // useful until you measure it — solar dominates all
                        // eight districts in every preset, so the colour was
                        // carrying no information at all.
                        fill={SERIES.solar}
                        fillOpacity={ramp(valueOf(a), minValue, maxValue)}
                        stroke={isSel ? "var(--color-fg)" : "var(--color-border-strong)"}
                        strokeWidth={isSel ? 4 : 1.6}
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                })}

                <path
                  d={RESERVOIR_PATH}
                  fill="oklch(0.55 0.13 235)"
                  fillOpacity={0.85}
                  stroke="oklch(0.75 0.12 235)"
                  strokeWidth={1.5}
                />

                {/* Transmission schematic: everything feeds the Mueang hub. */}
                {alloc.map((a) => {
                  const geo = GEO_BY_ID[a.d.id];
                  if (!geo || a.d.id === hub.d.id) return null;
                  return (
                    <line
                      key={`l-${a.d.id}`}
                      x1={geo.centroid[0]}
                      y1={geo.centroid[1]}
                      x2={hubGeo.centroid[0]}
                      y2={hubGeo.centroid[1]}
                      stroke="var(--color-fg-subtle)"
                      strokeWidth={0.8 + 2.4 * (a.capacityMW / Math.max(...alloc.map((x) => x.capacityMW), 1))}
                      strokeDasharray="9 7"
                      opacity={0.4}
                    />
                  );
                })}

                {alloc.map((a) => {
                  const geo = GEO_BY_ID[a.d.id];
                  if (!geo) return null;
                  const isSel = a.d.id === selected;
                  return (
                    <text
                      key={`t-${a.d.id}`}
                      x={geo.centroid[0]}
                      y={geo.centroid[1]}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={19}
                      fontWeight={isSel ? 700 : 500}
                      fill="var(--color-fg)"
                      // Labels sit over variable fills, so give them a
                      // background-coloured halo the way the Sankey does.
                      stroke="var(--color-bg)"
                      strokeWidth={4}
                      paintOrder="stroke"
                      strokeLinejoin="round"
                      className="pointer-events-none"
                    >
                      {a.d.name}
                    </text>
                  );
                })}
              </svg>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-hover)]/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-fg)]">
                      {sel.d.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-fg-subtle)]">
                      {sel.d.en} · {sel.d.role}
                    </p>
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
                  <Metric label="พื้นที่" value={`${sel.km2.toLocaleString()} km²`} color="var(--color-fg-subtle)" />
                  <Metric
                    label="ความหนาแน่น"
                    value={`${sel.capacityMWPerKm2.toFixed(2)} MW/km²`}
                    color="var(--color-fg-subtle)"
                  />
                  <Metric
                    label="ปูแผงได้"
                    value={`${Math.round(sel.buildableKm2).toLocaleString()} km²`}
                    color={SERIES.emerald}
                  />
                  <Metric
                    label="แผงกินที่"
                    value={`${(sel.solarLandPct * 100).toFixed(1)}%`}
                    color={sel.solarLandPct > 0.5 ? SERIES.rose : "var(--color-fg-subtle)"}
                  />
                </div>
                {/* The answer to an obvious objection, kept live so it stays
                    true when the sliders move. Kaeng Krachan is 77% national
                    park and still takes 820 MW of solar, which sounds wrong
                    until the land is counted: 9.2 km² of panels against 603
                    km² outside the park. */}
                <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
                  นอกเขตอุทยาน {Math.round(sel.buildableKm2).toLocaleString()} km²
                  จาก {sel.km2.toLocaleString()} · แผง {Math.round(sel.solarMW)} MW
                  ที่ 7 ไร่/MW กินที่ {(sel.solarMW * 0.0112).toFixed(1)} km²
                  {sel.solarLandPct < 0.1 ? " — ที่ดินไม่ใช่ข้อจำกัด" : ""}
                </p>
              </div>
              <p className="px-1 text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
                การจัดสรรอิงน้ำหนักตามบทบาทแต่ละอำเภอ (Gemini distributed plan) ปรับ
                slider ฝั่งซ้ายแล้วตัวเลขกระจายตามจริง · พื้นที่คำนวณจากขอบเขตจริง
                ไม่ได้คัดมาจากตาราง
              </p>
              <p className="px-1 text-[10px] text-[var(--color-fg-subtle)]">
                ขอบเขตอำเภอ เขื่อน และเขตอุทยาน ©{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                  // Inline in a sentence, so it can't take padding without
                  // breaking the line; grow the hit area behind it instead.
                  className="relative underline hover:text-[var(--color-fg-muted)] pointer-coarse:after:absolute pointer-coarse:after:-inset-y-3 pointer-coarse:after:-inset-x-1 pointer-coarse:after:content-['']"
                >
                  OpenStreetMap contributors
                </a>{" "}
                (ODbL)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="พื้นที่จังหวัด"
          value={`${alloc.reduce((s, a) => s + a.km2, 0).toLocaleString()} km²`}
          sub="8 อำเภอ"
          tone="violet"
        />
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
