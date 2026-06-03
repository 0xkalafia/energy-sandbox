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
  }> = [
    {
      label: "Carbon balance",
      value: kpis.netCarbonTon <= 0 ? "NET NEGATIVE" : "NET POSITIVE",
      sub: `${(Math.abs(kpis.netCarbonTon) / 1000).toFixed(0)}k ton/ปี`,
      tone: netZeroStatus === "negative" ? "emerald" : netZeroStatus === "near" ? "amber" : "rose",
      icon: <Leaf className="h-4 w-4" />,
    },
    {
      label: "Daily surplus",
      value: fmtEnergy(kpis.dailySurplusGWh * 1e6),
      sub: `produce ${fmtEnergy(kpis.dailySupplyGWh * 1e6)}`,
      tone: kpis.dailySurplusGWh >= 0 ? "sky" : "rose",
      icon: kpis.dailySurplusGWh >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />,
    },
    {
      label: "Annual value",
      value: fmtBaht(kpis.totalAnnualValue),
      sub: `payback ${kpis.paybackYears.toFixed(1)} ปี`,
      tone: "emerald",
      icon: <Coins className="h-4 w-4" />,
    },
    {
      label: "Yearly demand",
      value: fmtEnergy(kpis.yearlyDemandGWh * 1e6),
      sub: "all 6 missions",
      tone: "violet",
      icon: <Zap className="h-4 w-4" />,
    },
    {
      label: "Battery cycles",
      value: `${kpis.batteryCyclesPerDay.toFixed(2)}/วัน`,
      sub: `~${kpis.batteryLifespanYears.toFixed(0)} ปี อายุใช้งาน`,
      tone: "sky",
      icon: <Battery className="h-4 w-4" />,
    },
    {
      label: "CAPEX",
      value: fmtBaht(kpis.capexEstimate),
      sub: `OPEX ${fmtBaht(kpis.opexEstimate)}/ปี`,
      tone: "amber",
      icon: <Coins className="h-4 w-4" />,
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
        />
      ))}
    </div>
  );
}
