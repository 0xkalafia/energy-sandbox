import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { TOOLBAR_BUTTON } from "@/components/ui/toolbarButton";

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
        TOOLBAR_BUTTON,
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
