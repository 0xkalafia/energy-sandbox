import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SpatialMap } from "@/components/SpatialMap";
import { ThailandMap } from "@/components/ThailandMap";
import type { SimInputs } from "@/data/types";

/**
 * Two maps at two scales, behind one switch.
 *
 * A switch rather than an eleventh tab: the tab strip already overflows on a
 * 390px phone — it measured 790px wide before the header wrapping was fixed —
 * and these two views answer the same question at different zoom levels.
 *
 * They are also different kinds of thing, which the labels have to carry. The
 * province map shows an allocation that moves when the sliders move; the
 * national map shows measurements that never move. Someone who reads the
 * second as scenario output would badly misread it.
 */
type Scale = "province" | "country";

const SCALES: { value: Scale; label: string }[] = [
  { value: "province", label: "เพชรบุรี 8 อำเภอ" },
  { value: "country", label: "ทั้งประเทศ 77 จังหวัด" },
];

export function MapTab({ inputs }: { inputs: SimInputs }) {
  const [scale, setScale] = useState<Scale>("province");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl value={scale} onChange={setScale} options={SCALES} />
        <p className="text-[11px] text-[var(--color-fg-subtle)]">
          {scale === "province"
            ? "กำลังผลิตที่จัดสรรตามสถานการณ์ที่ตั้งไว้ — เลื่อนสไลเดอร์แล้วเปลี่ยน"
            : "ข้อมูลที่วัดมาจริง ไม่ขึ้นกับสไลเดอร์ — ไว้เทียบว่าเพชรบุรีต่างจากที่อื่นแค่ไหน"}
        </p>
      </div>
      {scale === "province" ? <SpatialMap inputs={inputs} /> : <ThailandMap />}
    </div>
  );
}
