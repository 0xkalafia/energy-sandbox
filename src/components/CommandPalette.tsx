import { useEffect, useState } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Compass,
  Flame,
  Sun,
  Cloud,
  Snowflake,
  CloudRain,
  Battery,
  Coins,
  Activity,
  Link as LinkIcon,
  RotateCcw,
  Moon,
  Monitor,
  Layers,
  Map,
} from "lucide-react";
import { toast } from "sonner";
import type { SimInputs, Season } from "@/data/types";
import { DEFAULT_INPUTS, PRESETS, type PresetId } from "@/data/constants";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { TABS } from "@/config/tabs";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputs: SimInputs;
  setInputs: (i: SimInputs) => void;
  setActiveTab: (id: string) => void;
}

const SEASONS: { id: Season; label: string; Icon: typeof Sun }[] = [
  { id: "summer", label: "ฤดูร้อน", Icon: Sun },
  { id: "rainy", label: "ฤดูฝน", Icon: CloudRain },
  { id: "winter", label: "ฤดูหนาว", Icon: Snowflake },
  { id: "monsoon", label: "มรสุม", Icon: Cloud },
];

const PRESET_IDS: PresetId[] = ["conservative", "balanced", "aggressive"];

export function CommandPalette({
  open,
  onOpenChange,
  inputs,
  setInputs,
  setActiveTab,
}: Props) {
  const [search, setSearch] = useState("");
  const { mode, setMode } = useTheme();

  // Reset search on close
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          style={{ animation: "overlay-in 180ms ease-out" }}
        />
        <Dialog.Content
          className={cn(
            "fixed top-[18%] left-1/2 z-[101] w-[92vw] max-w-[560px] -translate-x-1/2",
            "overflow-hidden rounded-xl border border-[var(--color-border-strong)]",
            "bg-[var(--color-bg-elevated)]/95 shadow-2xl backdrop-blur-xl",
          )}
          style={{ animation: "dialog-in 180ms cubic-bezier(0.2,0.8,0.2,1)" }}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search and run commands quickly
          </Dialog.Description>

          <Command
            label="Command palette"
            className="w-full"
            shouldFilter
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <Compass className="h-4 w-4 text-[var(--color-fg-subtle)]" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search a command, tab, preset, season…"
                className="w-full bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
                autoFocus
              />
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-muted)]">
                ESC
              </kbd>
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto py-2">
              <Command.Empty className="px-4 py-6 text-center text-sm text-[var(--color-fg-muted)]">
                No results.
              </Command.Empty>

              <Group heading="Navigate">
                {TABS.map((t, i) => (
                  <Item
                    key={t.id}
                    icon={<Layers className="h-3.5 w-3.5" />}
                    shortcut={`${i + 1}`}
                    onSelect={run(() => setActiveTab(t.id))}
                  >
                    Go to <strong className="font-semibold">{t.label}</strong>
                  </Item>
                ))}
              </Group>

              <Group heading="Preset">
                {PRESET_IDS.map((id) => (
                  <Item
                    key={id}
                    icon={<Flame className="h-3.5 w-3.5" />}
                    onSelect={run(() => {
                      setInputs(PRESETS[id].inputs);
                      toast.success(`Preset: ${PRESETS[id].label}`, {
                        description: PRESETS[id].description,
                      });
                    })}
                  >
                    Load preset{" "}
                    <strong className="font-semibold">{PRESETS[id].label}</strong>
                  </Item>
                ))}
              </Group>

              <Group heading="Season">
                {SEASONS.map((s) => {
                  const { Icon } = s;
                  return (
                    <Item
                      key={s.id}
                      icon={<Icon className="h-3.5 w-3.5" />}
                      onSelect={run(() => setInputs({ ...inputs, season: s.id }))}
                    >
                      Switch season →{" "}
                      <strong className="font-semibold">{s.label}</strong>
                    </Item>
                  );
                })}
              </Group>

              <Group heading="Theme">
                <Item
                  icon={<Sun className="h-3.5 w-3.5" />}
                  onSelect={run(() => setMode("light"))}
                >
                  Theme → Light
                </Item>
                <Item
                  icon={<Moon className="h-3.5 w-3.5" />}
                  onSelect={run(() => setMode("dark"))}
                >
                  Theme → Dark
                </Item>
                <Item
                  icon={<Monitor className="h-3.5 w-3.5" />}
                  onSelect={run(() => setMode("system"))}
                >
                  Theme → System ({mode === "system" ? "current" : "switch"})
                </Item>
              </Group>

              <Group heading="Actions">
                <Item
                  icon={<LinkIcon className="h-3.5 w-3.5" />}
                  shortcut="S"
                  onSelect={run(async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      toast.success("คัดลอกลิงก์เรียบร้อย");
                    } catch {
                      toast.error("คัดลอกไม่ได้");
                    }
                  })}
                >
                  Copy shareable link
                </Item>
                <Item
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  shortcut="R"
                  onSelect={run(() => {
                    setInputs(DEFAULT_INPUTS);
                    toast("รีเซ็ตค่ากลับเป็น default", { icon: "↺" });
                  })}
                >
                  Reset to defaults
                </Item>
              </Group>

              <Group heading="Tips">
                <ItemInfo icon={<Activity className="h-3.5 w-3.5" />}>
                  Press <Kbd>1</Kbd>–<Kbd>7</Kbd> to jump between tabs
                </ItemInfo>
                <ItemInfo icon={<Battery className="h-3.5 w-3.5" />}>
                  Press <Kbd>T</Kbd> to cycle theme · <Kbd>?</Kbd> for help
                </ItemInfo>
                <ItemInfo icon={<Coins className="h-3.5 w-3.5" />}>
                  Numbers update live as you adjust the sidebar
                </ItemInfo>
                <ItemInfo icon={<Map className="h-3.5 w-3.5" />}>
                  Your scenario is saved in the URL — share away!
                </ItemInfo>
              </Group>
            </Command.List>

            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-3 py-2 text-[10px] text-[var(--color-fg-subtle)]">
              <span>Phetchaburi 2046 · Energy Sandbox</span>
              <span>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate · <Kbd>↵</Kbd> select
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="px-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-[var(--color-fg-subtle)]"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  children,
  onSelect,
  icon,
  shortcut,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  icon?: React.ReactNode;
  shortcut?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        "mx-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--color-fg-muted)]",
        "data-[selected=true]:bg-[var(--color-bg-hover)] data-[selected=true]:text-[var(--color-fg)]",
      )}
    >
      <span className="text-[var(--color-fg-subtle)]">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </Command.Item>
  );
}

function ItemInfo({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="mx-1 flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-fg-subtle)]"
      data-disabled
    >
      <span>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="tabular ml-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-fg-muted)]">
      {children}
    </kbd>
  );
}

// Re-export ThemeMode type for downstream consumers (avoid TS unused-import warnings)
export type { ThemeMode };
