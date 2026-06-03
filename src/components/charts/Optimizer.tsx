import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Field } from "@/components/ui/Field";
import { Slider } from "@/components/ui/Slider";
import { cn, fmtBaht } from "@/lib/utils";
import { Play, Loader2, Sparkles } from "lucide-react";
import {
  DEFAULT_OPT,
  optimizeResilientMix,
  type OptOptions,
  type OptResult,
} from "@/engine/optimize";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

export function Optimizer({ inputs }: Props) {
  const [opts, setOpts] = useState<OptOptions>(DEFAULT_OPT);
  const [result, setResult] = useState<OptResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      setResult(optimizeResilientMix(inputs, opts));
      setRunning(false);
    }, 16);
  };

  const update = <K extends keyof OptOptions>(k: K, v: OptOptions[K]) =>
    setOpts({ ...opts, [k]: v });

  // Feasible CAPEX range for heatmap shading
  const { minFeasCapex, maxFeasCapex } = useMemo(() => {
    if (!result) return { minFeasCapex: 0, maxFeasCapex: 1 };
    const feas = result.grid.filter((p) => p.feasible).map((p) => p.capex);
    return {
      minFeasCapex: feas.length ? Math.min(...feas) : 0,
      maxFeasCapex: feas.length ? Math.max(...feas) : 1,
    };
  }, [result]);

  const savings =
    result?.best && result.baseline.feasible
      ? result.baseline.capex - result.best.capex
      : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Min-CAPEX resilience optimizer</CardTitle>
              <p className="mt-1 max-w-md text-[11px] text-[var(--color-fg-subtle)]">
                Grid-search solar × battery for the cheapest mix that survives a{" "}
                {opts.days}-day islanded monsoon with zero blackout (other inputs
                held).
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
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? "Searching…" : "Optimize"}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Islanded days" value={`${opts.days}`}>
              <Slider value={opts.days} onChange={(v) => update("days", v)} min={3} max={14} step={1} />
            </Field>
            <Field label="Grid resolution" value={`${opts.solarSteps}×${opts.batterySteps}`}>
              <Slider
                value={opts.solarSteps}
                onChange={(v) => setOpts({ ...opts, solarSteps: v, batterySteps: v })}
                min={5}
                max={12}
                step={1}
              />
            </Field>
            <Field label="Battery max" value={`${opts.batteryMaxGWh} GWh`}>
              <Slider value={opts.batteryMaxGWh} onChange={(v) => update("batteryMaxGWh", v)} min={10} max={60} step={5} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {result.best ? (
              <>
                <StatCard label="Cheapest resilient mix" value={`${(result.best.solarMW / 1000).toFixed(1)} GW`} sub="solar" tone="emerald" icon={<Sparkles className="h-4 w-4" />} />
                <StatCard label="+ battery" value={`${result.best.batteryGWh.toFixed(1)} GWh`} tone="violet" />
                <StatCard label="CAPEX" value={fmtBaht(result.best.capex)} tone="amber" />
                <StatCard
                  label={savings !== null ? "Saving vs current" : "Current feasible?"}
                  value={savings !== null ? fmtBaht(savings) : result.baseline.feasible ? "yes" : "NO"}
                  tone={savings !== null ? (savings > 0 ? "emerald" : "rose") : result.baseline.feasible ? "emerald" : "rose"}
                />
              </>
            ) : (
              <StatCard label="No feasible mix" value="ขยาย range" sub="ไม่มีจุดไหนรอด islanded" tone="rose" />
            )}
          </div>

          {/* Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle>Feasibility × CAPEX heatmap</CardTitle>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                Rows = solar · cols = battery · 🟢 brighter = cheaper feasible · ✕ = blackout · ⬜ = your current · ★ = best
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="inline-block">
                  {/* battery axis header */}
                  <div className="flex pl-12">
                    {result.batteryValues.map((b) => (
                      <div key={b} className="w-10 text-center text-[9px] text-[var(--color-fg-subtle)]">
                        {b}
                      </div>
                    ))}
                  </div>
                  {result.solarValues.map((s) => (
                    <div key={s} className="flex items-center">
                      <div className="w-12 pr-1 text-right text-[9px] text-[var(--color-fg-subtle)]">
                        {(s / 1000).toFixed(1)}G
                      </div>
                      {result.batteryValues.map((b) => {
                        const p = result.grid.find(
                          (g) => g.solarMW === s && g.batteryGWh === b,
                        )!;
                        const isBest = result.best && p.solarMW === result.best.solarMW && p.batteryGWh === result.best.batteryGWh;
                        const isBase =
                          Math.abs(p.solarMW - result.baseline.solarMW) < 1 &&
                          Math.abs(p.batteryGWh - result.baseline.batteryGWh) < 0.6;
                        // brightness: cheaper feasible = more opaque
                        const t = maxFeasCapex > minFeasCapex
                          ? 1 - (p.capex - minFeasCapex) / (maxFeasCapex - minFeasCapex)
                          : 1;
                        const opacity = p.feasible ? 0.25 + 0.65 * t : 0.12;
                        return (
                          <div
                            key={b}
                            title={`solar ${(s / 1000).toFixed(1)}GW · batt ${b}GWh\n${p.feasible ? "feasible" : `${p.unmetHours} blackout hr`}\nCAPEX ${fmtBaht(p.capex)} · low SoC ${(p.lowestSoC * 100).toFixed(0)}%`}
                            className={cn(
                              "m-[1px] flex h-9 w-10 items-center justify-center rounded text-[10px] font-medium",
                              isBest && "ring-2 ring-[var(--color-fg)]",
                              isBase && !isBest && "ring-1 ring-[var(--color-fg-muted)]",
                            )}
                            style={{
                              background: p.feasible
                                ? `oklch(0.78 0.18 155 / ${opacity})`
                                : `oklch(0.72 0.2 20 / ${opacity})`,
                            }}
                          >
                            {isBest ? "★" : isBase ? "⬜" : p.feasible ? "" : "✕"}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-[var(--color-fg-muted)]">
            {running ? "กำลังค้นหา…" : "กด Optimize เพื่อหา mix ที่ถูกสุดที่ยังรอด islanded"}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
