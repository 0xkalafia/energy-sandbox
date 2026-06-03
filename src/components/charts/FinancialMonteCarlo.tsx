import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Slider } from "@/components/ui/Slider";
import { StatCard } from "@/components/ui/StatCard";
import { useChartTheme, SERIES } from "@/lib/chartTheme";
import { GlassTooltip } from "@/components/charts/ChartTooltip";
import { cn, fmtPct } from "@/lib/utils";
import { Play, Loader2 } from "lucide-react";
import {
  DEFAULT_FIN_MC,
  histogram,
  runFinancialMC,
  type FinMCOptions,
  type FinMCResult,
} from "@/engine/financialMC";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

export function FinancialMonteCarlo({ inputs }: Props) {
  const theme = useChartTheme();
  const [opts, setOpts] = useState<FinMCOptions>(DEFAULT_FIN_MC);
  const [result, setResult] = useState<FinMCResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    // defer so the spinner paints before the (synchronous) compute
    setTimeout(() => {
      setResult(runFinancialMC(inputs, opts));
      setRunning(false);
    }, 16);
  };

  const update = <K extends keyof FinMCOptions>(k: K, v: FinMCOptions[K]) =>
    setOpts({ ...opts, [k]: v });
  const sd = (k: keyof FinMCOptions["sd"], v: number) =>
    setOpts({ ...opts, sd: { ...opts.sd, [k]: v / 100 } });

  const hist = result
    ? histogram(
        result.paybackYears.map((y) => Math.min(y, result.horizon + 1)),
        Math.min(result.horizon + 1, 22),
        [0, result.horizon + 1],
      )
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Financial Monte Carlo</CardTitle>
              <p className="mt-1 max-w-md text-[11px] text-[var(--color-fg-subtle)]">
                Sample price &amp; demand uncertainty → distribution of payback
                and lifetime net. "Given my priors, how likely to pay back?"
              </p>
            </div>
            <button
              onClick={run}
              disabled={running}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium",
                "border-[var(--color-emerald-glow)]/50 bg-[var(--color-emerald-glow)]/10 text-[var(--color-fg)] hover:bg-[var(--color-emerald-glow)]/20",
                running && "opacity-60",
              )}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {running ? "Running…" : "Run"}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Samples" value={`${opts.samples}`}>
              <Slider value={opts.samples} onChange={(v) => update("samples", v)} min={100} max={1000} step={50} />
            </Field>
            <Field label="Horizon" value={`${opts.horizon} ปี`}>
              <Slider value={opts.horizon} onChange={(v) => update("horizon", v)} min={10} max={30} step={1} />
            </Field>
            <Field label="Carbon ±σ" value={fmtPct(opts.sd.carbonPrice)}>
              <Slider value={opts.sd.carbonPrice * 100} onChange={(v) => sd("carbonPrice", v)} min={0} max={80} step={5} />
            </Field>
            <Field label="Battery ±σ" value={fmtPct(opts.sd.batteryPrice)}>
              <Slider value={opts.sd.batteryPrice * 100} onChange={(v) => sd("batteryPrice", v)} min={0} max={60} step={5} />
            </Field>
            <Field label="Methanol ±σ" value={fmtPct(opts.sd.methanolPrice)}>
              <Slider value={opts.sd.methanolPrice * 100} onChange={(v) => sd("methanolPrice", v)} min={0} max={60} step={5} />
            </Field>
            <Field label="Grid price ±σ" value={fmtPct(opts.sd.gridBuyPrice)}>
              <Slider value={opts.sd.gridBuyPrice * 100} onChange={(v) => sd("gridBuyPrice", v)} min={0} max={50} step={5} />
            </Field>
            <Field label="Demand ±σ" value={fmtPct(opts.sd.demand)}>
              <Slider value={opts.sd.demand * 100} onChange={(v) => sd("demand", v)} min={0} max={40} step={5} />
            </Field>
            <Field label="Seed" value={`${opts.seed}`}>
              <Slider value={opts.seed} onChange={(v) => update("seed", v)} min={1} max={999} step={1} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Pays back ≤ horizon"
              value={fmtPct(result.probPaysBack)}
              tone={result.probPaysBack > 0.8 ? "emerald" : result.probPaysBack > 0.5 ? "amber" : "rose"}
            />
            <StatCard label="Payback P50" value={`${result.payback.p50.toFixed(1)} ปี`} tone="violet" />
            <StatCard label="P10 / P90" value={`${result.payback.p10.toFixed(0)} / ${result.payback.p90.toFixed(0)}`} sub="ปี" tone="sky" />
            <StatCard
              label="Lifetime net P50"
              value={`฿${result.lifetimeNetB.p50.toFixed(0)}B`}
              tone={result.lifetimeNetB.p50 > 0 ? "emerald" : "rose"}
            />
            <StatCard
              label="P(net > 0)"
              value={fmtPct(result.probNetPositive)}
              tone={result.probNetPositive > 0.9 ? "emerald" : "amber"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payback distribution</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                X = payback year · last bin = "never within {result.horizon} ปี"
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={hist.map((h) => ({ label: `${h.lo.toFixed(0)}`, count: h.count, lo: h.lo }))}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <XAxis dataKey="label" {...theme.axisProps} />
                    <YAxis {...theme.axisProps} allowDecimals={false} />
                    <ReferenceLine x={`${result.payback.p50.toFixed(0)}`} stroke={theme.borderStrong} strokeDasharray="4 3" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const d = payload[0].payload as { label: string; count: number };
                        return (
                          <GlassTooltip title={`~Y${d.label}`}>
                            <p className="tabular text-sm font-medium text-[var(--color-fg)]">{d.count} samples</p>
                          </GlassTooltip>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {hist.map((h, i) => (
                        <Cell key={i} fill={h.lo > result.horizon ? SERIES.rose : SERIES.emerald} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-[var(--color-fg-muted)]">
            {running ? "กำลังรัน…" : "กด Run เพื่อจำลองความไม่แน่นอนทางการเงิน"}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
