import { GlassTooltip, SeriesRow } from "@/components/charts/ChartTooltip";

// Minimal shape of recharts' tooltip `content` callback argument so we don't
// need to import recharts' (unstable) generic types. Fields are optional and
// `payload` is readonly so recharts' concrete props are assignable to this.
export interface TooltipRenderProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{
    name?: string | number;
    value?: unknown;
    color?: string;
    payload?: Record<string, unknown>;
  }>;
}

/**
 * Ready-made `content` renderer that lists every series in the payload as a
 * SeriesRow. Pass a `unit` suffix and/or a `format` fn for the values.
 *
 *   <Tooltip content={seriesTooltip({ unit: " MW" })} />
 */
export function seriesTooltip(opts: {
  unit?: string;
  format?: (v: number) => string;
} = {}) {
  const { unit = "", format } = opts;
  return ({ active, payload, label }: TooltipRenderProps) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <GlassTooltip title={label}>
        <div className="space-y-0.5">
          {payload.map((p, i) => {
            const raw =
              typeof p.value === "number" ? p.value : Number(p.value);
            const shown = format
              ? format(raw)
              : Number.isFinite(raw)
                ? raw.toLocaleString()
                : String(p.value ?? "");
            return (
              <SeriesRow
                key={`${p.name ?? i}`}
                name={p.name}
                color={p.color}
                value={`${shown}${unit}`}
              />
            );
          })}
        </div>
      </GlassTooltip>
    );
  };
}
