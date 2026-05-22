import { useEffect, useMemo, useRef, useState } from "react";
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
import { Menu, Link as LinkIcon, Check } from "lucide-react";
import { decodeInputsFromHash, encodeInputsToHash } from "@/lib/urlHash";
import { CarbonWaterfall } from "@/components/charts/CarbonWaterfall";
import { SankeyDiagram } from "@/components/charts/SankeyDiagram";
import { ResilienceView } from "@/components/charts/ResilienceView";
import { MultiYearCashflow } from "@/components/charts/MultiYearCashflow";

export default function App() {
  // Hydrate inputs from URL hash on first render
  const [inputs, setInputs] = useState(() => {
    const fromHash = decodeInputsFromHash(window.location.hash);
    return fromHash ?? DEFAULT_INPUTS;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Debounced sync of inputs → URL hash (no history pollution)
  const hashTimer = useRef<number | null>(null);
  useEffect(() => {
    if (hashTimer.current) window.clearTimeout(hashTimer.current);
    hashTimer.current = window.setTimeout(() => {
      const next = encodeInputsToHash(inputs);
      const target = next ? `#${next}` : "";
      if (window.location.hash !== target) {
        history.replaceState(null, "", window.location.pathname + window.location.search + target);
      }
    }, 250);
    return () => {
      if (hashTimer.current) window.clearTimeout(hashTimer.current);
    };
  }, [inputs]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  const hourly = useMemo(() => simulateDay(inputs), [inputs]);
  const kpis = useMemo(() => computeKPIs(inputs, hourly), [inputs, hourly]);

  return (
    <div className="flex h-screen w-screen overflow-hidden text-[var(--color-fg)]">
      {/* Desktop sidebar (lg and up) */}
      <div className="hidden lg:flex lg:h-full lg:w-[340px] lg:shrink-0">
        <Sidebar inputs={inputs} setInputs={setInputs} />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[360px] lg:hidden">
            <Sidebar
              inputs={inputs}
              setInputs={setInputs}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 md:px-8 md:py-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <button
                onClick={() => setDrawerOpen(true)}
                className="mt-1 inline-flex items-center justify-center rounded-md border border-[var(--color-border)] p-2 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)] lg:hidden"
                title="Open controls"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">
                  Provincial Energy Sandbox
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
                  Phetchaburi{" "}
                  <span className="text-[var(--color-fg-muted)]">2046</span>
                </h1>
                <p className="mt-1 hidden text-sm text-[var(--color-fg-muted)] sm:block">
                  จำลองโครงข่ายพลังงาน 6 ภารกิจ — ปรับ slider แล้วผลลัพธ์อัปเดตทันที
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] backdrop-blur-md transition-all hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]"
                title="Copy shareable link"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-[var(--color-emerald-glow)]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-3 w-3" />
                    <span>Share</span>
                  </>
                )}
              </button>
              <Badge tone="emerald">Live</Badge>
              <Badge tone="neutral" className="hidden sm:inline-flex">
                v0.2
              </Badge>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="flow">Flow</TabsTrigger>
              <TabsTrigger value="hourly">Hourly</TabsTrigger>
              <TabsTrigger value="battery">Battery</TabsTrigger>
              <TabsTrigger value="resilience">Resilience</TabsTrigger>
              <TabsTrigger value="carbon">Carbon</TabsTrigger>
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

            <TabsContent value="flow" className="mt-6 space-y-6">
              <SankeyDiagram inputs={inputs} hourly={hourly} />
            </TabsContent>

            <TabsContent value="hourly" className="mt-6 space-y-6">
              <HourlyChart hourly={hourly} />
            </TabsContent>

            <TabsContent value="battery" className="mt-6 space-y-6">
              <BatteryChart hourly={hourly} inputs={inputs} />
            </TabsContent>

            <TabsContent value="resilience" className="mt-6 space-y-6">
              <ResilienceView inputs={inputs} />
            </TabsContent>

            <TabsContent value="carbon" className="mt-6 space-y-6">
              <CarbonWaterfall kpis={kpis} />
            </TabsContent>

            <TabsContent value="finance" className="mt-6 space-y-6">
              <KPIGrid kpis={kpis} />
              <MultiYearCashflow kpis={kpis} />
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
