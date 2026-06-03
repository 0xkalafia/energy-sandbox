import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { fmtBaht, fmtEnergy } from "@/lib/utils";
import type { KPIs } from "@/data/types";

interface Row {
  label: string;
  value: string;
  tone?: "emerald" | "rose";
  hint?: string;
}

export function FinanceBreakdown({ kpis: p }: { kpis: KPIs }) {
  const rows: Row[] = [
    { label: "Carbon Credits", value: fmtBaht(p.carbonCreditRevenue), tone: "emerald" },
    { label: "E-Methanol", value: fmtBaht(p.methanolRevenue), tone: "emerald" },
    {
      label: "H₂ co-products (O₂ + waste heat)",
      value: fmtBaht(p.hydrogenCoProductRevenue),
      tone: "emerald",
      hint: `${(p.oxygenTonPerYear / 1e3).toFixed(0)}k ton O₂ · ${p.wasteHeatGWhPerYear.toFixed(0)} GWh heat / ปี`,
    },
    { label: "Data Center leasing", value: fmtBaht(p.dcLeasingRevenue), tone: "emerald" },
    { label: "Cost avoidance (ค่าไฟ/น้ำมัน)", value: fmtBaht(p.costAvoidance), tone: "emerald" },
    { label: "OPEX (รายจ่ายดำเนินงาน)", value: `− ${fmtBaht(p.opexEstimate)}`, tone: "rose" },
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
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--color-fg-muted)]">
                  {r.label}
                </p>
                {r.hint && (
                  <p className="tabular truncate text-[10px] text-[var(--color-fg-subtle)]">
                    {r.hint}
                  </p>
                )}
              </div>
              <span
                className={`tabular shrink-0 text-sm font-medium ${
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
              Simple payback (yr-1)
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
