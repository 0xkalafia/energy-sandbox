import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className,
  disabled,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex h-5 w-full touch-none select-none items-center",
        disabled && "opacity-40",
        className,
      )}
      value={[value]}
      onValueChange={(v) => onChange(v[0])}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-[var(--color-border)]">
        <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-[var(--color-emerald-glow)] to-[var(--color-sky-glow)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          "block h-4 w-4 rounded-full",
          "bg-[var(--color-fg)] shadow-md",
          "ring-2 ring-[var(--color-bg)]",
          "transition-transform hover:scale-110",
          "focus-visible:ring-[var(--color-emerald-glow)] focus-visible:outline-none",
        )}
      />
    </SliderPrimitive.Root>
  );
}
