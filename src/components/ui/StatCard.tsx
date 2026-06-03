import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export type Tone = "emerald" | "amber" | "rose" | "sky" | "violet" | "neutral";

interface Props {
  label: string;
  value: ReactNode;
  /** Secondary line under the value (a.k.a. hint / sub). */
  sub?: ReactNode;
  tone?: Tone;
  /** When provided, renders the icon top-left (KPI-grid style). */
  icon?: ReactNode;
  /** Optional override colour for the value text. */
  valueClassName?: string;
  /** "Why this number?" — shows an (i) with the formula/assumption on hover. */
  info?: string;
}

function InfoDot({ info }: { info: string }) {
  return (
    <span
      title={info}
      className="inline-flex cursor-help text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
      aria-label={info}
    >
      <Info className="h-3 w-3" />
    </span>
  );
}

/**
 * One unified stat card. Two visual modes:
 *  - with `icon`  → icon top-left, badge dot top-right, then label/value/sub
 *  - without icon → label + badge dot in a row, then value/sub (compact)
 *
 * Replaces the four near-identical card components that used to live in
 * KPIGrid / ResilienceView / MonteCarloView / MultiYearCashflow.
 */
export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  valueClassName,
  info,
}: Props) {
  if (icon) {
    return (
      <Card className="group">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between">
            <div className="text-[var(--color-fg-subtle)] transition-colors group-hover:text-[var(--color-fg-muted)]">
              {icon}
            </div>
            <div className="flex items-center gap-1.5">
              {info && <InfoDot info={info} />}
              <Badge tone={tone}>•</Badge>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
              {label}
            </p>
            <p
              className={
                valueClassName ??
                "tabular text-lg font-semibold tracking-tight text-[var(--color-fg)]"
              }
            >
              {value}
            </p>
            {sub && (
              <p className="tabular text-[11px] text-[var(--color-fg-muted)]">
                {sub}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {label}
          </p>
          <div className="flex items-center gap-1.5">
            {info && <InfoDot info={info} />}
            <Badge tone={tone}>•</Badge>
          </div>
        </div>
        <p
          className={
            valueClassName ??
            "tabular mt-1 text-lg font-semibold text-[var(--color-fg)]"
          }
        >
          {value}
        </p>
        {sub && (
          <p className="tabular mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
