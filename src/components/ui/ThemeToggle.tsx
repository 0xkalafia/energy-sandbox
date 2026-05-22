import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  dark: "light",
  light: "system",
  system: "dark",
};

const LABEL: Record<ThemeMode, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

export function ThemeToggle({ className }: Props) {
  const { mode, setMode } = useTheme();
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  return (
    <button
      onClick={() => setMode(NEXT_MODE[mode])}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] backdrop-blur-md transition-all hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]",
        className,
      )}
      title={`Theme: ${LABEL[mode]} — click to switch`}
      aria-label={`Theme: ${LABEL[mode]}`}
    >
      <Icon className="h-3 w-3" />
      <span>{LABEL[mode]}</span>
    </button>
  );
}
