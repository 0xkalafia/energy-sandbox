import { cn } from "@/lib/utils";

type Tone = "emerald" | "rose" | "sky" | "violet";

const TONE: Record<Tone, string> = {
  emerald: "border-[var(--color-emerald-glow)]/40 bg-[var(--color-emerald-glow)]/10",
  rose: "border-[var(--color-rose-glow)]/40 bg-[var(--color-rose-glow)]/10",
  sky: "border-[var(--color-sky-glow)]/40 bg-[var(--color-sky-glow)]/10",
  violet: "border-[var(--color-violet-glow)]/40 bg-[var(--color-violet-glow)]/10",
};

interface Props<T> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  tone?: Tone;
  className?: string;
}

/**
 * Compact segmented button group. Replaces the hand-rolled toggle rows in the
 * Resilience / Monte Carlo / Sensitivity panels. Generic over the value type
 * (boolean / number / string).
 */
export function SegmentedControl<T extends string | number | boolean>({
  options,
  value,
  onChange,
  tone = "emerald",
  className,
}: Props<T>) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "tabular rounded-md border px-2 py-1 text-[11px] transition-colors",
            value === o.value
              ? `${TONE[tone]} text-[var(--color-fg)]`
              : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
