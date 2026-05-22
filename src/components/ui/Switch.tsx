import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}

export function Switch({ checked, onChange, className }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
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
