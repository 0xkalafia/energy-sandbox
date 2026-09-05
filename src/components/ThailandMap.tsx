import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SERIES } from "@/lib/chartTheme";
import { PROVINCES, GEO_VIEWBOX } from "@/data/geo/provinces";
import { PROVINCE_ELECTRICITY } from "@/data/geo/electricity";
import { PROVINCE_RESOURCE } from "@/data/geo/attributes";
import { PROVINCE_PROTECTED } from "@/data/geo/protected";
import { PHETCHABURI_ISO } from "@/data/constants";
import { AmphoeMap } from "@/components/AmphoeMap";

/**
 * The whole country, on the same measurements the Phetchaburi model runs on.
 *
 * The point of this view is comparison: the scenario picks one province and
 * argues about its 2046, and the obvious question is whether that province is
 * typical. It mostly isn't — Phetchaburi has middling sun, poor wind, a coast,
 * and 45% of its land inside a national park — and that is easier to see on a
 * map than to argue from a table.
 *
 * Every metric here is measured, not modelled. Nothing on this map depends on
 * the sliders.
 */

type MetricId = "electricity" | "elecDensity" | "solar" | "wind" | "protected";

interface Metric {
  id: MetricId;
  label: string;
  /** null means the province has no figure — drawn hatched, not as zero. */
  value: (iso: string) => number | null;
  format: (v: number) => string;
  hue: string;
  caption: string;
}

const elecOf = new Map(PROVINCE_ELECTRICITY.map((r) => [r.iso, r]));
const resOf = new Map(PROVINCE_RESOURCE.map((r) => [r.iso, r]));
const protOf = new Map(PROVINCE_PROTECTED.map((r) => [r.iso, r]));
const geoOf = new Map(PROVINCES.map((p) => [p.iso, p]));

const METRICS: Metric[] = [
  {
    id: "electricity",
    label: "ไฟที่ใช้",
    value: (iso) => elecOf.get(iso)?.gwhPerDay ?? null,
    format: (v) => `${v.toFixed(1)} GWh/วัน`,
    hue: SERIES.solar,
    caption:
      "ไฟฟ้าที่ใช้จริงทั้งจังหวัด ปี 2566 · กรุงเทพฯ 103 GWh/วัน มากกว่าแม่ฮ่องสอน 224 เท่า",
  },
  {
    id: "elecDensity",
    label: "ต่อ km²",
    value: (iso) => {
      const e = elecOf.get(iso);
      const g = geoOf.get(iso);
      return e && g?.km2 ? (e.gwhPerDay * 1000) / g.km2 : null;
    },
    format: (v) => `${v.toFixed(1)} MWh/วัน/km²`,
    hue: SERIES.solar,
    caption:
      "ยอดรวมเอื้อจังหวัดใหญ่เสมอ ต่อพื้นที่จึงบอกคนละเรื่อง — เมืองอุตสาหกรรมเล็กๆ ขึ้นมานำ",
  },
  {
    id: "solar",
    label: "แดด",
    value: (iso) => resOf.get(iso)?.solarCF ?? null,
    format: (v) => `CF ${v.toFixed(3)}`,
    hue: SERIES.solar,
    // The honest caption for this layer says not to trust the ranking.
    // Measured: the whole country spans 0.025 in CF, while a single province
    // spans up to 0.026 across its own amphoe. Sorting 77 provinces by a
    // number whose within-province spread matches the nationwide range is
    // sorting noise.
    caption:
      "PVGIS วัดรายอำเภอแล้วถ่วงตามพื้นที่ · ทั้งประเทศต่างกันแค่ 0.025 แต่ในจังหวัดเดียวก็ต่างได้ถึง 0.026 — อันดับจึงแทบไม่มีความหมาย ดูช่วงในการ์ดข้างล่าง",
  },
  {
    id: "wind",
    label: "ลม",
    value: (iso) => resOf.get(iso)?.windMS50 ?? null,
    format: (v) => `${v.toFixed(2)} m/s`,
    hue: SERIES.wind,
    caption:
      "ความเร็วลมที่ 50 ม. จาก NASA POWER · กริดหยาบ 55 กม. อ่านเป็นค่าต่ำสุดสำหรับจัดอันดับ ไม่ใช่ค่าออกแบบฟาร์ม",
  },
  {
    id: "protected",
    label: "พื้นที่อนุรักษ์",
    value: (iso) => protOf.get(iso)?.protectedFrac ?? null,
    format: (v) => `${(v * 100).toFixed(0)}%`,
    hue: SERIES.emerald,
    caption:
      "อุทยานและเขตรักษาพันธุ์ · ที่ดินในเขตนี้ปูแผงไม่ได้ กาญจนบุรีกับระนอง 53% เพชรบุรี 45%",
  },
];

/**
 * Shade across the observed range, not from zero — the same reasoning as the
 * province map. Solar CF nationwide spans 0.151 to 0.176; from zero that is
 * 77 identical shapes.
 */
function ramp(value: number, min: number, max: number): number {
  const t = max - min < 1e-9 ? 0.5 : (value - min) / (max - min);
  return 0.12 + 0.76 * t;
}

/**
 * Electricity spans three orders of magnitude — Bangkok 103 GWh/day against
 * Mae Hong Son 0.46 — so a linear ramp paints 76 provinces the palest shade
 * and Bangkok the darkest, which is a picture of Bangkok, not of Thailand.
 * A log ramp shows the rest of the country.
 */
const NEEDS_LOG = new Set<MetricId>(["electricity", "elecDensity"]);

export function ThailandMap() {
  const [metricId, setMetricId] = useState<MetricId>("electricity");
  const [selected, setSelected] = useState<string>(PHETCHABURI_ISO);
  /** Non-null when the map has zoomed into one province's amphoe. */
  const [zoomed, setZoomed] = useState<string | null>(null);
  const metric = METRICS.find((m) => m.id === metricId)!;

  const svgRef = useRef<SVGSVGElement>(null);
  /** Set only by arrow navigation, so a mouse click never steals focus. */
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    svgRef.current
      ?.querySelector<SVGGElement>(`[data-iso="${selected}"]`)
      ?.focus();
  }, [selected]);

  const { scaled, min, max, missing } = useMemo(() => {
    const raw = PROVINCES.map((p) => ({ iso: p.iso, v: metric.value(p.iso) }));
    const present = raw.filter((r) => r.v != null) as { iso: string; v: number }[];
    const log = NEEDS_LOG.has(metric.id);
    const t = (v: number) => (log ? Math.log10(Math.max(v, 1e-6)) : v);
    const ts = present.map((r) => t(r.v));
    return {
      scaled: new Map(present.map((r) => [r.iso, t(r.v)])),
      min: Math.min(...ts),
      max: Math.max(...ts),
      missing: raw.length - present.length,
      values: new Map(present.map((r) => [r.iso, r.v])),
    };
  }, [metric]);

  const ranked = useMemo(
    () =>
      PROVINCES.map((p) => ({ p, v: metric.value(p.iso) }))
        .filter((r) => r.v != null)
        .sort((a, b) => b.v! - a.v!),
    [metric],
  );

  const sel = geoOf.get(selected) ?? PROVINCES[0];
  const selElec = elecOf.get(sel.iso);
  const selRes = resOf.get(sel.iso);
  const selProt = protOf.get(sel.iso);
  const selRank = ranked.findIndex((r) => r.p.iso === sel.iso);

  const extremes = [ranked[0], ranked[ranked.length - 1]].filter(Boolean);

  const zoomedProvince = zoomed ? geoOf.get(zoomed) : null;
  if (zoomedProvince) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-5">
            {/* Keyed on the province so switching one for another remounts
                rather than reusing state that belongs to the old one. */}
            <AmphoeMap
              key={zoomedProvince.iso}
              province={zoomedProvince}
              onBack={() => setZoomed(null)}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>ทั้งประเทศ — 77 จังหวัด</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                {metric.caption}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                value={metricId}
                onChange={setMetricId}
                options={METRICS.map((m) => ({ value: m.id, label: m.label }))}
              />
              {/* The ramp is anchored to the observed range, and for
                  electricity it is logarithmic, so the ends have to be printed
                  or the shading means nothing. */}
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-fg-subtle)]">
                <span className="tabular">
                  {metric.format(ranked[ranked.length - 1]?.v ?? 0)}
                </span>
                <span className="flex h-3 w-16 overflow-hidden rounded-sm border border-[var(--color-border)]">
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <span
                      key={t}
                      className="flex-1"
                      style={{ background: metric.hue, opacity: 0.12 + 0.76 * t }}
                    />
                  ))}
                </span>
                <span className="tabular">{metric.format(ranked[0]?.v ?? 0)}</span>
                {NEEDS_LOG.has(metric.id) && <span className="ml-1">(log)</span>}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${GEO_VIEWBOX.width} ${GEO_VIEWBOX.height}`}
                className="mx-auto h-full max-h-[620px] w-full"
                // Not role="img": every province in here is a button, and
                // role="img" promises no interactive descendants.
                role="group"
                aria-label={`แผนที่ประเทศไทย 77 จังหวัด แรเงาตาม${metric.label}`}
              >
                {PROVINCES.map((p, idx) => {
                  const s = scaled.get(p.iso);
                  const isSel = p.iso === selected;
                  const isHome = p.iso === PHETCHABURI_ISO;
                  const v = metric.value(p.iso);
                  return (
                    <g
                      key={p.iso}
                      role="button"
                      // Roving tabindex: one stop for the whole map, arrows to
                      // move within it. Giving all 77 provinces tabIndex 0
                      // would put 77 stops between the metric buttons and
                      // everything after the map, which is a worse keyboard
                      // experience than no map at all. The province map next
                      // door has eight and can afford to be simple; this one
                      // cannot.
                      tabIndex={isSel ? 0 : -1}
                      aria-label={`${p.th} ${p.en} ${
                        v == null ? "ไม่มีข้อมูล" : metric.format(v)
                      }`}
                      aria-pressed={isSel}
                      className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-emerald-glow)]"
                      onClick={() => setSelected(p.iso)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(p.iso);
                          return;
                        }
                        const step =
                          e.key === "ArrowRight" || e.key === "ArrowDown"
                            ? 1
                            : e.key === "ArrowLeft" || e.key === "ArrowUp"
                              ? -1
                              : e.key === "Home"
                                ? -idx
                                : e.key === "End"
                                  ? PROVINCES.length - 1 - idx
                                  : 0;
                        if (!step) return;
                        e.preventDefault();
                        const next =
                          PROVINCES[
                            (idx + step + PROVINCES.length) % PROVINCES.length
                          ];
                        // Focus has to follow selection, or the single roving
                        // stop is left on an element that just became
                        // untabbable and the keyboard falls out of the map.
                        // Moving it here does not work: the element is not
                        // tabbable until React commits, and a focus() scheduled
                        // in a frame callback lands either side of that commit
                        // depending on timing — measured, it silently did
                        // nothing. The effect below runs after the commit,
                        // which is the only moment the target is ready.
                        moveFocus.current = true;
                        setSelected(next.iso);
                      }}
                      data-iso={p.iso}
                    >
                      {/* Plain presentation attributes, deliberately. An
                          earlier version painted through `style` on the theory
                          that an attribute change invalidates more — measured
                          in a browser that was actually compositing, the two
                          are identical (13.9ms vs 14.0ms, against 13.8ms for
                          touching nothing at all: re-shading all 77 costs less
                          than one frame). The reading that suggested otherwise
                          came from a hidden tab, which does not rasterise. */}
                      <path
                        d={p.outline}
                        fill={s == null ? "var(--color-bg-hover)" : metric.hue}
                        fillOpacity={s == null ? 1 : ramp(s, min, max)}
                        stroke={
                          isSel
                            ? "var(--color-fg)"
                            : isHome
                              ? "var(--color-emerald-glow)"
                              : "var(--color-border-strong)"
                        }
                        strokeWidth={isSel ? 5 : isHome ? 3 : 0.8}
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                })}
              </svg>
              {missing > 0 && (
                <p className="absolute bottom-1 left-2 text-[10px] text-[var(--color-fg-subtle)]">
                  {missing} จังหวัดไม่มีข้อมูลด้านนี้
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">
                  {sel.th}{" "}
                  <span className="text-[var(--color-fg-subtle)]">{sel.en}</span>
                </h3>
                {sel.iso === PHETCHABURI_ISO && (
                  <Badge tone="emerald">จังหวัดของโมเดลนี้</Badge>
                )}
                {selRes?.coastal && <Badge tone="sky">ติดทะเล</Badge>}
                {selRank >= 0 && (
                  <span className="text-[11px] text-[var(--color-fg-subtle)]">
                    อันดับ {selRank + 1} จาก {ranked.length} ด้าน{metric.label}
                  </span>
                )}
              </div>

              {/* Into the third level. The button lives here rather than on the
                  map itself because a click on a province already means
                  "select", and overloading it with "enter" would make one of
                  the two unreachable by keyboard. */}
              <button
                onClick={() => setZoomed(sel.iso)}
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-[11px] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] pointer-coarse:min-h-[36px]"
              >
                ดูรายอำเภอ — {sel.th} มี {sel.amphoeCount} อำเภอ →
              </button>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatCard
                  label="ไฟที่ใช้"
                  value={selElec ? `${selElec.gwhPerDay.toFixed(2)}` : "—"}
                  sub="GWh/วัน · 2566"
                  tone="amber"
                  info="ไฟฟ้าที่ใช้จริงทุกประเภทผู้ใช้ จากกระทรวงพลังงาน ไม่ใช่ค่าประมาณ"
                />
                <StatCard
                  label="ต่อคน"
                  value={selElec?.kwhPerPerson?.toLocaleString() ?? "—"}
                  sub="kWh/ปี"
                  tone="neutral"
                />
                <StatCard
                  label="พื้นที่"
                  value={sel.km2.toLocaleString()}
                  sub={`km² · ${sel.amphoeCount} อำเภอ`}
                  tone="neutral"
                />
                <StatCard
                  label="แดด"
                  value={selRes ? selRes.solarCF.toFixed(3) : "—"}
                  // The range matters more than the figure. A province whose
                  // own amphoe span as much as the country does cannot be
                  // meaningfully ranked against its neighbours, and the card
                  // should say so where the number is read, not only in the
                  // caption above the map.
                  sub={
                    selRes
                      ? `CF · ${selRes.solarSamples} อำเภอ: ${selRes.solarCFRange[0].toFixed(3)}-${selRes.solarCFRange[1].toFixed(3)}`
                      : "CF"
                  }
                  tone="amber"
                  info="PVGIS วัดรายอำเภอที่มุมเอียงดีที่สุด แล้วถ่วงน้ำหนักตามพื้นที่ · ช่วงคือค่าต่ำสุด-สูงสุดของอำเภอในจังหวัดนี้"
                />
                <StatCard
                  label="ลม 50 ม."
                  value={selRes ? selRes.windMS50.toFixed(2) : "—"}
                  sub="m/s"
                  tone="sky"
                  info="NASA POWER กริดราว 55 กม. เกลี่ยสันเขาหายไป ใช้จัดอันดับได้ ใช้ออกแบบฟาร์มไม่ได้"
                />
                <StatCard
                  label="พื้นที่อนุรักษ์"
                  value={selProt ? `${(selProt.protectedFrac * 100).toFixed(0)}%` : "—"}
                  sub={selProt ? `${selProt.protectedKm2.toLocaleString()} km²` : ""}
                  tone="emerald"
                  info="อุทยาน เขตรักษาพันธุ์สัตว์ป่า และเขตสงวน จาก OpenStreetMap"
                />
              </div>

              {selElec && (
                <div className="rounded-lg border border-[var(--color-border)] p-3">
                  <p className="mb-2 text-[11px] text-[var(--color-fg-muted)]">
                    แยกตามประเภทผู้ใช้ไฟ (GWh/ปี)
                  </p>
                  <div className="space-y-1">
                    {(
                      [
                        ["ที่อยู่อาศัย", selElec.byClass.residential],
                        ["ธุรกิจ/อุตสาหกรรม", selElec.byClass.business],
                        ["ราชการ/ไฟสาธารณะ", selElec.byClass.government],
                        ["สูบน้ำเกษตร", selElec.byClass.agriculture],
                        ["สถานีชาร์จ EV", selElec.byClass.ev],
                      ] as const
                    ).map(([label, v]) => (
                      <div key={label} className="flex items-center gap-2 text-[11px]">
                        <span className="w-32 shrink-0 text-[var(--color-fg-muted)]">
                          {label}
                        </span>
                        <span
                          className="h-2 rounded-sm"
                          style={{
                            background: SERIES.solar,
                            width: `${Math.max(1, (v / selElec.gwhPerYear) * 100)}%`,
                            opacity: 0.7,
                          }}
                        />
                        <span className="tabular text-[var(--color-fg-subtle)]">
                          {v.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* "ธุรกิจ" here is a tariff class, not an economic sector:
                      it is small through large-scale supply, defined by
                      connected load, so it holds a mall and a factory alike. */}
                  <p className="mt-2 text-[10px] text-[var(--color-fg-subtle)]">
                    เป็นประเภทค่าไฟ ไม่ใช่สาขาเศรษฐกิจ — "ธุรกิจ" รวมทั้งห้างและโรงงาน
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <p className="mb-1.5 text-[11px] text-[var(--color-fg-muted)]">
                  สุดขั้วด้าน{metric.label}
                </p>
                {extremes.map((r, i) => (
                  <div
                    key={r.p.iso}
                    className="flex items-center justify-between text-[11px]"
                  >
                    {/* 11px text makes a 17px button, which is half the
                        minimum tap target. Grown on coarse pointers only, so
                        the desktop density is unchanged — the same treatment
                        the segmented controls use. */}
                    <button
                      onClick={() => setSelected(r.p.iso)}
                      className="flex items-center text-left underline-offset-2 hover:underline pointer-coarse:min-h-[36px]"
                    >
                      {i === 0 ? "สูงสุด" : "ต่ำสุด"} · {r.p.th}
                    </button>
                    <span className="tabular text-[var(--color-fg-subtle)]">
                      {metric.format(r.v!)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
