import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { SERIES } from "@/lib/chartTheme";
import { PHETCHABURI_ISO } from "@/data/constants";
import type { ProvinceGeo } from "@/data/geo/types";
import type { ProvinceElectricity } from "@/data/geo/electricity";
import type { ProvinceResource } from "@/data/geo/attributes";
import type { ProvinceProtected } from "@/data/geo/protected";

/**
 * Everything the nationwide map says about one province.
 *
 * Split out of ThailandMap, which had grown to 720 lines with 430 of them in
 * a single return — six responsibilities in one function, and the panel was
 * the one with no ties to the map's own state. It reads its province and
 * renders; the map keeps the zoom, the geometry loading and the selection.
 *
 * Everything here is measured. Nothing on this panel moves when the sliders
 * do, which is the opposite of the province map next door, and the labels are
 * written so the two are not mistaken for each other.
 */

export interface Extreme {
  province: ProvinceGeo;
  value: number;
}

interface Props {
  province: ProvinceGeo;
  electricity?: ProvinceElectricity;
  resource?: ProvinceResource;
  protectedArea?: ProvinceProtected;
  /** Where this province sits on the metric currently shading the map. */
  rank: { position: number; of: number; metricLabel: string } | null;
  /** Highest and lowest on that metric, as shortcuts. */
  extremes: Extreme[];
  formatMetric: (v: number) => string;
  onSelect: (iso: string) => void;
  onDrillDown: (iso: string) => void;
}

export function ProvincePanel({
  province,
  electricity,
  resource,
  protectedArea,
  rank,
  extremes,
  formatMetric,
  onSelect,
  onDrillDown,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">
          {province.th}{" "}
          <span className="text-[var(--color-fg-subtle)]">{province.en}</span>
        </h3>
        {province.iso === PHETCHABURI_ISO && (
          <Badge tone="emerald">จังหวัดของโมเดลนี้</Badge>
        )}
        {resource?.coastal && <Badge tone="sky">ติดทะเล</Badge>}
        {rank && (
          <span className="text-[11px] text-[var(--color-fg-subtle)]">
            อันดับ {rank.position} จาก {rank.of} ด้าน{rank.metricLabel}
          </span>
        )}
      </div>

      {/* Into the third level. The button lives here rather than on the map
          itself because a click on a province already means "select", and
          overloading it with "enter" would make one of the two unreachable by
          keyboard. */}
      <button
        onClick={() => onDrillDown(province.iso)}
        className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-[11px] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] pointer-coarse:min-h-[36px]"
      >
        ดูรายอำเภอ — {province.th} มี {province.amphoeCount} อำเภอ →
      </button>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard
          label="ไฟที่ใช้"
          value={electricity ? `${electricity.gwhPerDay.toFixed(2)}` : "—"}
          sub="GWh/วัน · 2566"
          tone="amber"
          info="ไฟฟ้าที่ใช้จริงทุกประเภทผู้ใช้ จากกระทรวงพลังงาน ไม่ใช่ค่าประมาณ"
        />
        <StatCard
          label="ต่อคน"
          value={electricity?.kwhPerPerson?.toLocaleString() ?? "—"}
          sub="kWh/ปี"
          tone="neutral"
        />
        <StatCard
          label="พื้นที่"
          value={province.km2.toLocaleString()}
          sub={`km² · ${province.amphoeCount} อำเภอ`}
          tone="neutral"
        />
        <StatCard
          label="แดด"
          value={resource ? resource.solarCF.toFixed(3) : "—"}
          // The range matters more than the figure. A province whose own
          // amphoe span as much as the country does cannot be meaningfully
          // ranked against its neighbours, and the card should say so where
          // the number is read, not only in the caption above the map.
          sub={
            resource
              ? `CF · ${resource.solarSamples} อำเภอ: ${resource.solarCFRange[0].toFixed(3)}-${resource.solarCFRange[1].toFixed(3)}`
              : "CF"
          }
          tone="amber"
          info="PVGIS วัดรายอำเภอที่มุมเอียงดีที่สุด แล้วถ่วงน้ำหนักตามพื้นที่ · ช่วงคือค่าต่ำสุด-สูงสุดของอำเภอในจังหวัดนี้"
        />
        <StatCard
          label="ลม 50 ม."
          value={resource ? resource.windMS50.toFixed(2) : "—"}
          sub="m/s"
          tone="sky"
          info="NASA POWER กริดราว 55 กม. เกลี่ยสันเขาหายไป ใช้จัดอันดับได้ ใช้ออกแบบฟาร์มไม่ได้"
        />
        <StatCard
          label="พื้นที่อนุรักษ์"
          value={
            protectedArea ? `${(protectedArea.protectedFrac * 100).toFixed(0)}%` : "—"
          }
          sub={protectedArea ? `${protectedArea.protectedKm2.toLocaleString()} km²` : ""}
          tone="emerald"
          info="อุทยาน เขตรักษาพันธุ์สัตว์ป่า และเขตสงวน จาก OpenStreetMap"
        />
      </div>

      {electricity && (
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className="mb-2 text-[11px] text-[var(--color-fg-muted)]">
            แยกตามประเภทผู้ใช้ไฟ (GWh/ปี)
          </p>
          <div className="space-y-1">
            {(
              [
                ["ที่อยู่อาศัย", electricity.byClass.residential],
                ["ธุรกิจ/อุตสาหกรรม", electricity.byClass.business],
                ["ราชการ/ไฟสาธารณะ", electricity.byClass.government],
                ["สูบน้ำเกษตร", electricity.byClass.agriculture],
                ["สถานีชาร์จ EV", electricity.byClass.ev],
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
                    width: `${Math.max(1, (v / electricity.gwhPerYear) * 100)}%`,
                    opacity: 0.7,
                  }}
                />
                <span className="tabular text-[var(--color-fg-subtle)]">
                  {v.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {/* "ธุรกิจ" here is a tariff class, not an economic sector: it is
              small through large-scale supply, defined by connected load, so
              it holds a mall and a factory alike. */}
          <p className="mt-2 text-[10px] text-[var(--color-fg-subtle)]">
            เป็นประเภทค่าไฟ ไม่ใช่สาขาเศรษฐกิจ — "ธุรกิจ" รวมทั้งห้างและโรงงาน
          </p>
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-border)] p-3">
        <p className="mb-1.5 text-[11px] text-[var(--color-fg-muted)]">
          สุดขั้วด้าน{rank?.metricLabel ?? ""}
        </p>
        {extremes.map((r, i) => (
          <div
            key={r.province.iso}
            className="flex items-center justify-between text-[11px]"
          >
            {/* 11px text makes a 17px button, which is half the minimum tap
                target. Grown on coarse pointers only, so the desktop density
                is unchanged. */}
            <button
              onClick={() => onSelect(r.province.iso)}
              className="flex items-center text-left underline-offset-2 hover:underline pointer-coarse:min-h-[36px]"
            >
              {i === 0 ? "สูงสุด" : "ต่ำสุด"} · {r.province.th}
            </button>
            <span className="tabular text-[var(--color-fg-subtle)]">
              {formatMetric(r.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
