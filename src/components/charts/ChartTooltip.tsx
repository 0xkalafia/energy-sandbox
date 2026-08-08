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

