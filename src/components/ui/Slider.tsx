import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import { useFieldLabelId } from "@/components/ui/fieldLabel";

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  className?: string;
  disabled?: boolean;
  /** Accessible name. Only needed outside a `Field`, which supplies one. */
  label?: string;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className,
  disabled,
  label,
}: SliderProps) {
  const labelledBy = useFieldLabelId();
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
      // Stop wheel events on the slider so vertical scrolling the sidebar
      // doesn't accidentally adjust values. We only need to stop propagation
      // so default page-scroll behaviour is preserved.
      onWheel={(e) => e.stopPropagation()}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-[var(--color-border)]">
        <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-[var(--color-emerald-glow)] to-[var(--color-sky-glow)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        // The thumb is what carries role="slider", so the name has to live
        // here rather than on the Root.
        aria-label={label}
        aria-labelledby={label ? undefined : labelledBy}
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
