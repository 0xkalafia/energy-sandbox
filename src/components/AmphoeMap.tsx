import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SERIES } from "@/lib/chartTheme";
import { ramp } from "@/lib/choropleth";
import { ChoroplethLegend } from "@/components/ui/ChoroplethLegend";
import { loadAmphoe } from "@/data/geo/provinces";
import type { AmphoeGeo, ProvinceGeo } from "@/data/geo/types";
import { PROVINCE_ELECTRICITY } from "@/data/geo/electricity";
import { PHETCHABURI_ISO } from "@/data/constants";
import { useRovingFocus } from "@/lib/useRovingFocus";

/**
 * One province, drawn from its own amphoe.
 *
 * The third zoom level, and the one where the data thins out. Boundaries and
 * protected area exist for all 931 amphoe; electricity does not exist below
 * the province at all, and solar was only sampled at six amphoe per province.
 * The view says which of those it is showing rather than dividing a province
 * figure by area and presenting the result as a measurement.
 *
 * Geometry comes from the same nationwide projection as the country map, so
 * zooming in is a change of viewBox over identical coordinates — no second
 * coordinate system, and an amphoe sits exactly where its province did.
 */

type Metric = "protected" | "area";

const METRICS: { value: Metric; label: string }[] = [
  { value: "protected", label: "พื้นที่อนุรักษ์" },
  { value: "area", label: "พื้นที่" },
];

const elecOf = new Map(PROVINCE_ELECTRICITY.map((r) => [r.iso, r]));

export function AmphoeMap({
  province,
  onBack,
}: {
  province: ProvinceGeo;
  onBack: () => void;
}) {
  const [amphoe, setAmphoe] = useState<AmphoeGeo[] | null>(null);
  /**
   * Protected fraction keyed by OSM relation id, fetched rather than imported.
   *
   * All 931 rows are 94 kB, and nobody who never opens a province needs them.
   * A static import would have put that in the Map tab's chunk for every
   * visitor; districts.ts gets Phetchaburi's eight from a small named export
   * instead, so it can keep working at module load without dragging the rest
   * along.
   */
  const [protOf, setProtOf] = useState<Map<string, { protectedFrac: number; protectedKm2: number }>>(
    () => new Map(),
  );
  const [failed, setFailed] = useState(false);
  const [metric, setMetric] = useState<Metric>("protected");
  const [selected, setSelected] = useState<string | null>(null);


  // No state resetting here: the caller keys this component on the province,
  // so switching province remounts it and every piece of state starts fresh.
  // Clearing them by hand inside the effect would be a cascading render, and
  // would leave the previous province's amphoe on screen for a frame.
  useEffect(() => {
    let live = true;
    Promise.all([loadAmphoe(province.iso), import("@/data/geo/protectedAmphoe")])
      .then(([list, prot]) => {
        if (!live) return;
        setProtOf(new Map(prot.AMPHOE_PROTECTED.map((a) => [a.id, a])));
        setAmphoe(list);
      })
      .catch(() => {
        // A chunk that will not load is worth saying out loud. Rendering an
        // empty province instead would look like a province with no districts.
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [province.iso]);

  const svgRef = useRef<SVGSVGElement>(null);
  const roving = useRovingFocus({
    items: amphoe ?? [],
    selected,
    onSelect: setSelected,
    attribute: "data-amphoe",
    key: (a) => a.id,
    container: svgRef,
  });

  const valueOf = useMemo(
    () => (a: AmphoeGeo) =>
      metric === "protected" ? (protOf.get(a.id)?.protectedFrac ?? 0) : a.km2,
    [metric, protOf],
  );

  const { min, max } = useMemo(() => {
    const vs = (amphoe ?? []).map(valueOf);
    return vs.length ? { min: Math.min(...vs), max: Math.max(...vs) } : { min: 0, max: 1 };
  }, [amphoe, valueOf]);

  const fmt = (v: number) =>
    metric === "protected" ? `${(v * 100).toFixed(0)}%` : `${Math.round(v).toLocaleString()} km²`;

  // The province's own bounding box, with a little air so the outline is not
  // flush against the frame.
  const [x0, y0, x1, y1] = province.bbox;
  const pad = Math.max(x1 - x0, y1 - y0) * 0.04;
  const viewBox = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;

  const sel = amphoe?.find((a) => a.id === selected) ?? null;
  const selProt = sel ? protOf.get(sel.id) : null;
  const elec = elecOf.get(province.iso);

  /*
   * Label size has to come from the rendered width, not from the viewBox.
   *
   * Deriving it from the province's own extent looked right and was not: SVG
   * user units scale to fit, so the same fraction of a big province and a
   * small one land at completely different pixel sizes. Nakhon Ratchasima
   * came out with 3px labels — measured, not guessed — and 19 overlapping
   * pairs among its 32 amphoe.
   *
   * So: measure the box, then convert a target size in CSS pixels back into
   * user units.
   */
  const [renderedPx, setRenderedPx] = useState(0);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setRenderedPx(e.contentRect.width || 0),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [amphoe, svgRef]);

  const span = Math.max(x1 - x0, y1 - y0);
  const viewW = x1 - x0 + pad * 2;
  const perPx = renderedPx > 0 ? viewW / renderedPx : span / 400;
  const stroke = perPx * 0.8;
  const fontSize = perPx * 11;

  /*
   * Only label what can actually be read, on two counts, both measured.
   *
   * Too many: thirty-two Thai names do not fit a province a few hundred pixels
   * across at any legible size. Nakhon Ratchasima produced 19 overlapping
   * pairs before this cap.
   *
   * Too narrow: on a 390px phone even Phetchaburi's eight collide — Ban Lat
   * and Mueang Phetchaburi are adjacent, small, and their centroids sit 3px
   * apart. That is not a font-size problem, so shrinking the text would not
   * fix it; there is simply no room. On a phone the map is for tapping and
   * the panel carries the name.
   */
  const labelled =
    amphoe && amphoe.length <= 12 && renderedPx >= 380 ? amphoe : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Not "← ทั้งประเทศ", which is what this said first: the tab's own
              switch is labelled "ทั้งประเทศ 77 จังหวัด" and sits a few
              centimetres away, so two different controls answered to the same
              words. Confusing to read and ambiguous to anyone navigating by
              accessible name. */}
          <button
            onClick={onBack}
            aria-label={`ย้อนกลับไปแผนที่ประเทศ จาก${province.th}`}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] pointer-coarse:min-h-[36px] pointer-coarse:px-3"
          >
            ← ย้อนกลับ
          </button>
          <h3 className="text-sm font-medium">
            {province.th}{" "}
            <span className="text-[var(--color-fg-subtle)]">
              {province.amphoeCount} อำเภอ
            </span>
          </h3>
          {province.iso === PHETCHABURI_ISO && (
            <Badge tone="emerald">จังหวัดของโมเดลนี้</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl value={metric} onChange={setMetric} options={METRICS} />
          <ChoroplethLegend
            hue={metric === "protected" ? SERIES.emerald : SERIES.solar}
            low={fmt(min)}
            high={fmt(max)}
          />

        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="relative min-h-[280px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
          {failed && (
            <p className="p-4 text-[11px] text-[var(--color-rose-glow)]">
              โหลดขอบเขตอำเภอไม่สำเร็จ — ถ้าเพิ่งมีเวอร์ชันใหม่ ลองรีโหลดหน้า
            </p>
          )}
          {!amphoe && !failed && (
            <div className="flex h-full min-h-[280px] items-center justify-center text-[11px] text-[var(--color-fg-subtle)]">
              กำลังโหลดขอบเขต {province.amphoeCount} อำเภอ…
            </div>
          )}
          {amphoe && (
            <svg
              ref={svgRef}
              viewBox={viewBox}
              className="mx-auto h-full max-h-[560px] w-full"
              role="group"
              aria-label={`แผนที่${province.th} ${amphoe.length} อำเภอ แรเงาตาม${
                METRICS.find((m) => m.value === metric)?.label
              }`}
            >
              {amphoe.map((a, idx) => {
                const isSel = a.id === selected;
                const v = valueOf(a);
                return (
                  <g
                    key={a.id}
                    role="button"
                    tabIndex={roving.isTabStop(idx) ? 0 : -1}
                    aria-pressed={isSel}
                    aria-label={`${a.th} ${a.en} ${a.km2.toLocaleString()} ตารางกิโลเมตร พื้นที่อนุรักษ์ ${((protOf.get(a.id)?.protectedFrac ?? 0) * 100).toFixed(0)} เปอร์เซ็นต์`}
                    data-amphoe={a.id}
                    className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-emerald-glow)]"
                    onClick={() => setSelected(a.id)}
                    onKeyDown={(e) => roving.onKeyDown(e, idx)}
                  >
                    <path
                      d={a.path}
                      fill={metric === "protected" ? SERIES.emerald : SERIES.solar}
                      fillOpacity={ramp(v, min, max)}
                      stroke={isSel ? "var(--color-fg)" : "var(--color-border-strong)"}
                      strokeWidth={isSel ? stroke * 3 : stroke}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}
              {[...labelled, ...(sel && !labelled.includes(sel) ? [sel] : [])].map((a) => (
                <text
                  key={`t-${a.id}`}
                  x={a.centroid[0]}
                  y={a.centroid[1]}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill="var(--color-fg)"
                  // Labels sit over variable fills, so give them a
                  // background-coloured halo, the way the province map does.
                  stroke="var(--color-bg)"
                  strokeWidth={fontSize / 4}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  className="pointer-events-none"
                >
                  {a.th}
                </text>
              ))}
            </svg>
          )}
        </div>

        <div className="space-y-3">
          {sel ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium">
                  {sel.th}{" "}
                  <span className="text-[var(--color-fg-subtle)]">{sel.en}</span>
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatCard
                  label="พื้นที่"
                  value={sel.km2.toLocaleString()}
                  sub="km²"
                  tone="neutral"
                />
                <StatCard
                  label="พื้นที่อนุรักษ์"
                  value={`${((selProt?.protectedFrac ?? 0) * 100).toFixed(0)}%`}
                  sub={`${(selProt?.protectedKm2 ?? 0).toLocaleString()} km²`}
                  tone="emerald"
                  info="อุทยาน เขตรักษาพันธุ์สัตว์ป่า และเขตสงวน วัดด้วยการแปลงเป็นตารางกริด 550 ม. จาก OpenStreetMap"
                />
                <StatCard
                  label="ปูแผงได้"
                  value={Math.round(
                    sel.km2 * (1 - (selProt?.protectedFrac ?? 0)),
                  ).toLocaleString()}
                  sub="km² นอกเขตอนุรักษ์"
                  tone="amber"
                />
              </div>
              <p className="rounded-lg border border-[var(--color-border)] p-3 text-[10px] leading-relaxed text-[var(--color-fg-subtle)]">
                {/* What this level does not have, said plainly. Dividing a
                    province figure by area would look like a measurement and
                    would not be one. */}
                ระดับอำเภอมีแค่ขอบเขตกับพื้นที่อนุรักษ์ · การใช้ไฟฟ้าเก็บเป็นรายจังหวัด
                ไม่มีรายอำเภอ ({province.th} ทั้งจังหวัด{" "}
                {elec ? `${elec.gwhPerDay.toFixed(2)} GWh/วัน` : "ไม่มีข้อมูล"}) ·
                แดดสุ่มวัดจังหวัดละไม่เกิน 6 อำเภอ จึงไม่แสดงรายอำเภอ
              </p>
            </>
          ) : (
            <p className="rounded-lg border border-[var(--color-border)] p-4 text-[11px] text-[var(--color-fg-subtle)]">
              กดเลือกอำเภอบนแผนที่เพื่อดูรายละเอียด · เขตอนุรักษ์คือที่ดินที่ปูแผงไม่ได้
              และมันไม่ได้กระจายเท่ากัน — ในเพชรบุรี 45% ของจังหวัด แต่แก่งกระจานอำเภอเดียว 77%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
