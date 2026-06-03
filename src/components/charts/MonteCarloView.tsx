import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Slider } from "@/components/ui/Slider";
import { cn, fmtPct } from "@/lib/utils";
import { Play, Loader2 } from "lucide-react";
import {
  DEFAULT_MC,
  histogram,
  type MonteCarloOptions,
  type MonteCarloResult,
} from "@/engine/monteCarlo";
import type { SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
}

export function MonteCarloView({ inputs }: Props) {
  const [opts, setOpts] = useState<MonteCarloOptions>(DEFAULT_MC);
  const [islanded, setIslanded] = useState(true);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  // Spin up the worker once.
  useEffect(() => {
    const worker = new Worker(
      new URL("../../engine/mc.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<MonteCarloResult>) => {
      setResult(e.data);
      setRunning(false);
      setDirty(false);
    };
    workerRef.current = worker;
    // Kick off an initial run with defaults.
    setRunning(true);
    worker.postMessage({
      inputs,
      opts,
      gridLimitMW: islanded ? 0 : Number.POSITIVE_INFINITY,
    });
    return () => worker.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any change to inputs/opts/mode marks the current result stale.
  useEffect(() => {
    setDirty(true);
  }, [inputs, opts, islanded]);

  const run = () => {
    if (!workerRef.current || running) return;
    setRunning(true);
    workerRef.current.postMessage({
      inputs,
      opts,
      gridLimitMW: islanded ? 0 : Number.POSITIVE_INFINITY,
    });
  };

  const update = <K extends keyof MonteCarloOptions>(
    key: K,
    val: MonteCarloOptions[K],
  ) => setOpts({ ...opts, [key]: val });

  const updateWeight = (k: keyof MonteCarloOptions["weights"], val: number) =>
    setOpts({ ...opts, weights: { ...opts.weights, [k]: val / 100 } });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Monte Carlo simulation</CardTitle>
              <p className="mt-1 max-w-md text-[11px] text-[var(--color-fg-subtle)]">
                N stochastic weather realizations, run off-thread. Islanded mode
                makes blackout risk meaningful (grid can't paper over deficits).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: true, label: "Islanded" },
                    { id: false, label: "Grid-backed" },
                  ] as const
                ).map((m) => (
                  <button
                    key={String(m.id)}
                    onClick={() => setIslanded(m.id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px]",
                      islanded === m.id
                        ? "border-[var(--color-rose-glow)]/40 bg-[var(--color-rose-glow)]/10 text-[var(--color-fg)]"
                        : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)]",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <button
                onClick={run}
                disabled={running}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all",
                  dirty && !running
                    ? "border-[var(--color-emerald-glow)]/50 bg-[var(--color-emerald-glow)]/10 text-[var(--color-fg)]"
                    : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)]",
                  running && "opacity-60",
                )}
              >
                {running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {running ? "Running…" : dirty ? "Run (stale)" : "Run"}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Runs" value={`${opts.runs}`} hint="จำนวน realizations">
              <Slider
                value={opts.runs}
                onChange={(v) => update("runs", v)}
                min={20}
                max={500}
                step={10}
              />
            </Field>
            <Field label="Days per run" value={`${opts.days}`} hint="ระยะเวลาแต่ละ run">
              <Slider
                value={opts.days}
                onChange={(v) => update("days", v)}
                min={3}
                max={30}
                step={1}
              />
            </Field>
            <Field label="Seed" value={`${opts.seed}`} hint="เปลี่ยนเพื่อ resample">
              <Slider
                value={opts.seed}
                onChange={(v) => update("seed", v)}
                min={1}
                max={1000}
                step={1}
              />
            </Field>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                Blackout risk
              </p>
              <p
                className={cn(
                  "tabular mt-1 text-lg font-semibold",
                  !result
                    ? "text-[var(--color-fg-subtle)]"
                    : result.unmetRiskPct > 0.1
                      ? "text-[var(--color-rose-glow)]"
                      : result.unmetRiskPct > 0
                        ? "text-[var(--color-amber-glow)]"
                        : "text-[var(--color-emerald-glow)]",
                )}
              >
                {result ? fmtPct(result.unmetRiskPct) : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">
                % runs ที่มี critical shed
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              Season weights (sampled per run)
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="ร้อน" value={fmtPct(opts.weights.summer)}>
                <Slider
                  value={opts.weights.summer * 100}
                  onChange={(v) => updateWeight("summer", v)}
                  max={100}
                  step={1}
                />
              </Field>
              <Field label="ฝน" value={fmtPct(opts.weights.rainy)}>
                <Slider
                  value={opts.weights.rainy * 100}
                  onChange={(v) => updateWeight("rainy", v)}
                  max={100}
                  step={1}
                />
              </Field>
              <Field label="หนาว" value={fmtPct(opts.weights.winter)}>
                <Slider
                  value={opts.weights.winter * 100}
                  onChange={(v) => updateWeight("winter", v)}
                  max={100}
                  step={1}
                />
              </Field>
              <Field label="มรสุม" value={fmtPct(opts.weights.monsoon)}>
                <Slider
                  value={opts.weights.monsoon * 100}
                  onChange={(v) => updateWeight("monsoon", v)}
                  max={100}
                  step={1}
                />
              </Field>
            </div>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <MCResults result={result} runCount={result.runs.length} />
      ) : (
        <Card>
          <CardContent className="flex h-40 items-center justify-center text-sm text-[var(--color-fg-muted)]">
            {running ? "กำลังรัน Monte Carlo…" : "กด Run เพื่อเริ่มจำลอง"}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MCResults({
  result,
  runCount,
}: {
  result: MonteCarloResult;
  runCount: number;
}) {
  const p = result.percentiles;
  const socHist = histogram(
    result.runs.map((r) => r.lowestSoC * 100),
    20,
    [0, 100],
  );
  const importHist = histogram(
    result.runs.map((r) => r.importGWh),
    20,
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[var(--color-fg-subtle)]">
          {runCount} realizations · percentiles below
        </p>
        <Badge tone="violet">{runCount} runs</Badge>
      </div>

      {/* Percentile KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Pctile label="Lowest SoC · P5" value={`${(p.lowestSoC.p5 * 100).toFixed(0)}%`} tone="rose" />
        <Pctile label="P50 (median)" value={`${(p.lowestSoC.p50 * 100).toFixed(0)}%`} tone="violet" />
        <Pctile label="P95" value={`${(p.lowestSoC.p95 * 100).toFixed(0)}%`} tone="emerald" />
        <Pctile label="Blackout hrs · P50" value={`${p.unmetHours.p50.toFixed(0)}`} tone={p.unmetHours.p50 > 0 ? "rose" : "emerald"} />
        <Pctile label="P95" value={`${p.unmetHours.p95.toFixed(0)}`} tone={p.unmetHours.p95 > 0 ? "rose" : "emerald"} />
        <Pctile label="Import GWh · P50" value={p.importGWh.p50.toFixed(1)} tone="sky" />
      </div>

      {/* SoC histogram */}
      <Card>
        <CardHeader>
          <CardTitle>Distribution: lowest SoC reached</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            X = SoC bin (%) · Y = run count · red = below 10% DoD floor
          </p>
        </CardHeader>
        <CardContent>
          <HistogramChart data={socHist} unit="%" redBelow={10} />
        </CardContent>
      </Card>

      {/* Import histogram */}
      <Card>
        <CardHeader>
          <CardTitle>Distribution: total grid import</CardTitle>
          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
            How much external grid help did each scenario need?
          </p>
        </CardHeader>
        <CardContent>
          <HistogramChart data={importHist} unit=" GWh" />
        </CardContent>
      </Card>
    </>
  );
}

function HistogramChart({
  data,
  unit,
  redBelow,
}: {
  data: ReturnType<typeof histogram>;
  unit: string;
  redBelow?: number;
}) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.map((d) => ({
            label: `${d.lo.toFixed(0)}${unit}`,
            count: d.count,
            lo: d.lo,
          }))}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="var(--color-fg-subtle)"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={Math.ceil(data.length / 8)}
          />
          <YAxis
            stroke="var(--color-fg-subtle)"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const d = payload[0].payload as { label: string; count: number };
              return (
                <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/95 px-3 py-2 shadow-xl backdrop-blur-md">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                    {d.label}
                  </p>
                  <p className="tabular text-sm font-medium text-[var(--color-fg)]">
                    {d.count} runs
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  redBelow !== undefined && d.lo < redBelow
                    ? "oklch(0.72 0.2 20)"
                    : "oklch(0.7 0.2 290)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Pctile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "amber" | "sky" | "violet";
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {label}
          </p>
          <Badge tone={tone}>•</Badge>
        </div>
        <p className="tabular mt-1 text-lg font-semibold text-[var(--color-fg)]">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
