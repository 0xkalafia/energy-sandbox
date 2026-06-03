import { Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  running: boolean;
  onClick: () => void;
  /** When true, the button is highlighted and shows the "stale" affordance. */
  dirty?: boolean;
  idleLabel?: string;
  runningLabel?: string;
  /** Shown when dirty && !running. Defaults to `${idleLabel} (stale)`. */
  dirtyLabel?: string;
}

/**
 * Shared "Run" button used by the Monte Carlo / Financial MC / Optimizer cards.
 * Spinner while running; emerald highlight when there are unsynced changes.
 */
export function RunButton({
  running,
  onClick,
  dirty = false,
  idleLabel = "Run",
  runningLabel = "Running…",
  dirtyLabel,
}: Props) {
  const label = running
    ? runningLabel
    : dirty
      ? (dirtyLabel ?? `${idleLabel} (stale)`)
      : idleLabel;

  return (
    <button
      onClick={onClick}
      disabled={running}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-all",
        !running &&
          "border-[var(--color-emerald-glow)]/50 bg-[var(--color-emerald-glow)]/10 text-[var(--color-fg)] hover:bg-[var(--color-emerald-glow)]/20",
        running &&
          "border-[var(--color-border)] text-[var(--color-fg-muted)] opacity-60",
      )}
    >
      {running ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}
