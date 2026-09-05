import { RAMP_MIN, RAMP_SPAN } from "@/lib/choropleth";

/**
 * The strip that explains a map's shading.
 *
 * Every caller has to pass both ends, because the ramp is anchored to the
 * observed range rather than to zero — without the numbers, the darkest patch
 * means nothing in particular.
 */

interface Props {
  /** Text for the pale end and the dark end — already formatted. */
  low: string;
  high: string;
  /** The hue being ramped. */
  hue: string;
  /** Shown after the high end, e.g. "(log)". */
  note?: string;
}

export function ChoroplethLegend({ low, high, hue, note }: Props) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-fg-subtle)]">
      <span className="tabular">{low}</span>
      <span className="flex h-3 w-16 overflow-hidden rounded-sm border border-[var(--color-border)]">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            className="flex-1"
            style={{ background: hue, opacity: RAMP_MIN + RAMP_SPAN * t }}
          />
        ))}
      </span>
      <span className="tabular">{high}</span>
      {note && <span className="ml-1">{note}</span>}
    </div>
  );
}
