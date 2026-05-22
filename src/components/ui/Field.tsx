import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  value?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, value, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium tracking-wide text-[var(--color-fg-muted)]">
          {label}
        </label>
        {value !== undefined && (
          <span className="tabular text-xs font-medium text-[var(--color-fg)]">
            {value}
          </span>
        )}
      </div>
      {children}
      {hint && (
        <p className="text-[10px] text-[var(--color-fg-subtle)]">{hint}</p>
      )}
    </div>
  );
}
