import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { useFieldLabelId } from "@/components/ui/fieldLabel";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
  /** What this toggles. Required unless the switch sits inside a `Field`,
   *  since a bare switch reads out as "button, off" and nothing else. */
  label?: string;
}

export function Switch({ checked, onChange, className, label }: SwitchProps) {
  const labelledBy = useFieldLabelId();
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      aria-labelledby={label ? undefined : labelledBy}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
        // 20×36 is fine to click and too small to thumb. Grow the hit area
        // with an invisible overlay rather than the switch itself, so the
        // control looks identical on every device.
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']",
        "border border-[var(--color-border)] transition-colors",
        "data-[state=checked]:bg-[var(--color-emerald-glow)]/30",
        "data-[state=checked]:border-[var(--color-emerald-glow)]",
        "data-[state=unchecked]:bg-[var(--color-bg-hover)]",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-3.5 w-3.5 rounded-full bg-[var(--color-fg)] shadow-sm",
          "transition-transform translate-x-0.5",
          "data-[state=checked]:translate-x-[18px]",
          "data-[state=checked]:bg-[var(--color-emerald-glow)]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
