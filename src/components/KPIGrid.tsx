import { StatCard, type Tone } from "@/components/ui/StatCard";
import type { KPIs } from "@/data/types";
import { fmtBaht, fmtEnergy } from "@/lib/utils";
import { TrendingDown, TrendingUp, Leaf, Coins, Zap, Battery } from "lucide-react";

interface Props {
  kpis: KPIs;
}

export function KPIGrid({ kpis }: Props) {
  const netZeroStatus = kpis.netCarbonTon <= 0 ? "negative" : kpis.netCarbonTon < 100_000 ? "near" : "positive";

  const cards: Array<{
    label: string;
    value: string;
    sub?: string;
    tone?: Tone;
    icon: React.ReactNode;
    info?: string;
  }> = [
    {
      label: "Carbon balance",
      value: kpis.netCarbonTon <= 0 ? "NET NEGATIVE" : "NET POSITIVE",
      sub: `${(Math.abs(kpis.netCarbonTon) / 1000).toFixed(0)}k ton/ปี`,
      tone: netZeroStatus === "negative" ? "emerald" : netZeroStatus === "near" ? "amber" : "rose",
      icon: <Leaf className="h-4 w-4" />,
      info: "ปล่อยฐาน 500k ตัน/ปี (หลังเปลี่ยน EV) − DAC ดูดกลับ. ติดลบ = ดูดมากกว่าปล่อย (carbon negative)",
    },
    {
      label: "Daily surplus",
      value: fmtEnergy(kpis.dailySurplusGWh * 1e6),
      sub: `produce ${fmtEnergy(kpis.dailySupplyGWh * 1e6)}`,
      tone: kpis.dailySurplusGWh >= 0 ? "sky" : "rose",
      icon: kpis.dailySurplusGWh >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />,
      info: "ผลิตรวม − ใช้รวม ต่อวัน (ฤดูที่เลือกใน sidebar). ผลิต = solar/wind ตาม CF + biomass/hydro",
    },
    {
      label: "Annual value",
      value: fmtBaht(kpis.totalAnnualValue),
      sub: `payback ${kpis.paybackYears.toFixed(1)} ปี`,
      tone: "emerald",
      icon: <Coins className="h-4 w-4" />,
      info: "Carbon credit + methanol export + Data Center lease + cost avoidance (ค่าไฟ/น้ำมันที่ไม่ต้องจ่าย) + H₂ co-products (O₂+ความร้อน)",
    },
    {
      label: "Yearly demand",
      value: fmtEnergy(kpis.yearlyDemandGWh * 1e6),
      sub: "all 6 missions",
      tone: "violet",
      icon: <Zap className="h-4 w-4" />,
      info: "ผลรวม 6 ภารกิจ: lifestyle + DAC(2500 kWh/ton) + methanol(H₂ 45kWh/kg) + DC + desal(3 kWh/m³) + plasma(1000 kWh/ton) + บำบัดน้ำเสีย",
    },
    {
      label: "Battery cycles",
      value: `${kpis.batteryCyclesPerDay.toFixed(2)}/วัน`,
      sub: `~${kpis.batteryLifespanYears.toFixed(0)} ปี อายุใช้งาน`,
      tone: "sky",
      icon: <Battery className="h-4 w-4" />,
      info: "discharge รวม/วัน ÷ ความจุ. อายุ = 5,000 cycles ÷ (cycles/วัน × 365), cap ที่ 40 ปี",
    },
    {
      label: "CAPEX",
      value: fmtBaht(kpis.capexEstimate),
      sub: `OPEX ${fmtBaht(kpis.opexEstimate)}/ปี`,
      tone: "amber",
      icon: <Coins className="h-4 w-4" />,
      info: "solar 25M฿/MW + wind 50M + biomass 80M + แบต(ราคา×kWh) + lump sum ต่อโรงงาน (DAC 30B, methanol 50B, DC 20B…). OPEX = 2.5%/ปี",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <StatCard
          key={c.label}
          label={c.label}
          value={c.value}
          sub={c.sub}
          tone={c.tone}
          icon={c.icon}
          info={c.info}
        />
      ))}
    </div>
  );
}
