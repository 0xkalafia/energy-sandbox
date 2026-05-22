import { useMemo, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { KPIGrid } from "@/components/KPIGrid";
import { HourlyChart } from "@/components/charts/HourlyChart";
import { BatteryChart } from "@/components/charts/BatteryChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { DEFAULT_INPUTS } from "@/data/constants";
import { computeKPIs, simulateDay } from "@/engine/simulate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { fmtBaht, fmtEnergy } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export default function App() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);

  const hourly = useMemo(() => simulateDay(inputs), [inputs]);
  const kpis = useMemo(() => computeKPIs(inputs, hourly), [inputs, hourly]);

  return (
    <div className="flex h-screen w-screen overflow-hidden text-[var(--color-fg)]">
      <Sidebar inputs={inputs} setInputs={setInputs} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] space-y-6 px-8 py-6">
          {/* Header */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
                Provincial Energy Sandbox
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Phetchaburi{" "}
                <span className="text-[var(--color-fg-muted)]">2046</span>
              </h1>
              <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                จำลองโครงข่ายพลังงาน 6 ภารกิจ — ปรับ slider แล้วผลลัพธ์อัปเดตทันที
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="emerald">Live</Badge>
              <Badge tone="neutral">v0.1</Badge>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="hourly">Hourly</TabsTrigger>
              <TabsTrigger value="battery">Battery</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
              <KPIGrid kpis={kpis} />
              <HourlyChart hourly={hourly} />
              <div className="grid gap-6 lg:grid-cols-2">
                <BatteryChart hourly={hourly} inputs={inputs} />
                <FinanceBreakdown
                  carbonCreditRevenue={kpis.carbonCreditRevenue}
                  methanolRevenue={kpis.methanolRevenue}
                  dcLeasingRevenue={kpis.dcLeasingRevenue}
                  costAvoidance={kpis.costAvoidance}
                  opexEstimate={kpis.opexEstimate}
                  capexEstimate={kpis.capexEstimate}
                  totalAnnualValue={kpis.totalAnnualValue}
                  yearlyDemandGWh={kpis.yearlyDemandGWh}
                  paybackYears={kpis.paybackYears}
                />
              </div>
            </TabsContent>

            <TabsContent value="hourly" className="mt-6 space-y-6">
              <HourlyChart hourly={hourly} />
            </TabsContent>

            <TabsContent value="battery" className="mt-6 space-y-6">
              <BatteryChart hourly={hourly} inputs={inputs} />
            </TabsContent>

            <TabsContent value="finance" className="mt-6 space-y-6">
              <KPIGrid kpis={kpis} />
              <FinanceBreakdown
                carbonCreditRevenue={kpis.carbonCreditRevenue}
                methanolRevenue={kpis.methanolRevenue}
                dcLeasingRevenue={kpis.dcLeasingRevenue}
                costAvoidance={kpis.costAvoidance}
                opexEstimate={kpis.opexEstimate}
                capexEstimate={kpis.capexEstimate}
                totalAnnualValue={kpis.totalAnnualValue}
                yearlyDemandGWh={kpis.yearlyDemandGWh}
                paybackYears={kpis.paybackYears}
              />
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <footer className="pt-4 pb-8 text-[10px] text-[var(--color-fg-subtle)]">
            Simulator built with React + Vite + Tailwind v4 + Recharts ·
            Baseline data from Gemini chat (May 2026)
          </footer>
        </div>
      </main>
    </div>
  );
}

interface FinanceProps {
  carbonCreditRevenue: number;
  methanolRevenue: number;
  dcLeasingRevenue: number;
  costAvoidance: number;
  opexEstimate: number;
  capexEstimate: number;
  totalAnnualValue: number;
  yearlyDemandGWh: number;
  paybackYears: number;
}

function FinanceBreakdown(p: FinanceProps) {
  const rows: Array<{ label: string; value: string; tone?: "emerald" | "rose" }> =
    [
      {
        label: "Carbon Credits",
        value: fmtBaht(p.carbonCreditRevenue),
        tone: "emerald",
      },
      {
        label: "E-Methanol",
        value: fmtBaht(p.methanolRevenue),
        tone: "emerald",
      },
      {
        label: "Data Center leasing",
        value: fmtBaht(p.dcLeasingRevenue),
        tone: "emerald",
      },
      {
        label: "Cost avoidance (ค่าไฟ/น้ำมัน)",
        value: fmtBaht(p.costAvoidance),
        tone: "emerald",
      },
      {
        label: "OPEX (รายจ่ายดำเนินงาน)",
        value: `− ${fmtBaht(p.opexEstimate)}`,
        tone: "rose",
      },
    ];

  const net = p.totalAnnualValue - p.opexEstimate;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Annual financial flow</CardTitle>
        <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
          Yearly value vs OPEX · CAPEX = {fmtBaht(p.capexEstimate)}
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-[var(--color-border)]/60">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between py-2.5"
            >
              <span className="text-sm text-[var(--color-fg-muted)]">
                {r.label}
              </span>
              <span
                className={`tabular text-sm font-medium ${
                  r.tone === "rose"
                    ? "text-[var(--color-rose-glow)]"
                    : "text-[var(--color-emerald-glow)]"
                }`}
              >
                {r.value}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-semibold text-[var(--color-fg)]">
              Net annual cashflow
            </span>
            <span className="tabular text-base font-semibold text-[var(--color-fg)]">
              {fmtBaht(net)}
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-fg-muted)]">
              Yearly demand
            </span>
            <span className="tabular text-[11px] font-medium">
              {fmtEnergy(p.yearlyDemandGWh * 1e6)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-fg-muted)]">
              Payback period
            </span>
            <span className="tabular text-[11px] font-medium">
              {p.paybackYears.toFixed(1)} ปี
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
