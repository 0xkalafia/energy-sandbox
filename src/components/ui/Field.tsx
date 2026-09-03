import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FieldLabelContext } from "@/components/ui/fieldLabel";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  value?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, value, children, className }: FieldProps) {
  const labelId = useId();
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          id={labelId}
          className="text-xs font-medium tracking-wide text-[var(--color-fg-muted)]"
        >
          {label}
        </label>
        {value !== undefined && (
          <span className="tabular text-xs font-medium text-[var(--color-fg)]">
            {value}
          </span>
        )}
      </div>
      {/* The control inside reads this id and names itself after the label —
          see fieldLabel.ts for why htmlFor can't do it. */}
      <FieldLabelContext.Provider value={labelId}>
        {children}
      </FieldLabelContext.Provider>
      {hint && (
        <p className="text-[10px] text-[var(--color-fg-subtle)]">{hint}</p>
      )}
    </div>
  );
}
