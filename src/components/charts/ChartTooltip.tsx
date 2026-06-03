import type { ReactNode } from "react";

/** Shared glass-morphism tooltip chrome used by every chart. */
export function GlassTooltip({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/95 px-3 py-2 shadow-xl backdrop-blur-md">
      {title !== undefined && title !== null && (
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
          {title}
        </p>
      )}
      <div className={title !== undefined && title !== null ? "mt-1" : ""}>
        {children}
      </div>
    </div>
  );
}

/** One coloured-dot row: ● name … value. */
export function SeriesRow({
  name,
  value,
  color,
}: {
  name: ReactNode;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      {color && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
      )}
      <span className="text-[var(--color-fg-muted)]">{name}</span>
      <span className="tabular ml-auto font-medium text-[var(--color-fg)]">
        {value}
      </span>
    </div>
  );
}

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
