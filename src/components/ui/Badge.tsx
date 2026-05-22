import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "neutral" | "emerald" | "amber" | "rose" | "sky" | "violet";

const TONE: Record<Tone, string> = {
  neutral:
    "bg-[var(--color-bg-hover)] text-[var(--color-fg-muted)] border-[var(--color-border)]",
  emerald:
    "bg-[oklch(0.78_0.18_155/0.12)] text-[var(--color-emerald-glow)] border-[oklch(0.78_0.18_155/0.3)]",
  amber:
    "bg-[oklch(0.83_0.17_75/0.12)] text-[var(--color-amber-glow)] border-[oklch(0.83_0.17_75/0.3)]",
  rose: "bg-[oklch(0.72_0.2_20/0.12)] text-[var(--color-rose-glow)] border-[oklch(0.72_0.2_20/0.3)]",
  sky: "bg-[oklch(0.78_0.14_235/0.12)] text-[var(--color-sky-glow)] border-[oklch(0.78_0.14_235/0.3)]",
  violet:
    "bg-[oklch(0.7_0.2_290/0.12)] text-[var(--color-violet-glow)] border-[oklch(0.7_0.2_290/0.3)]",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[10px] font-medium uppercase tracking-wider tabular",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
