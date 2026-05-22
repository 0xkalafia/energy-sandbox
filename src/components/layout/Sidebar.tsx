import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import type { SimInputs } from "@/data/types";
import { SEASONS } from "@/data/types";
import { fmtPower } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { DEFAULT_INPUTS, PRESETS, type PresetId } from "@/data/constants";
import { toast } from "sonner";
import {
  RotateCcw,
  Zap,
  Battery,
  Flame,
  Cpu,
  Droplets,
  Recycle,
  Waves,
  X,
} from "lucide-react";

interface Props {
  inputs: SimInputs;
  setInputs: (i: SimInputs) => void;
  onClose?: () => void;
}

export function Sidebar({ inputs, setInputs, onClose }: Props) {
  const update = <K extends keyof SimInputs>(key: K, val: SimInputs[K]) =>
    setInputs({ ...inputs, [key]: val });

  return (
    <aside
      className={cn(
        "h-full w-full overflow-y-auto border-r border-[var(--color-border)]",
        "bg-[var(--color-bg-elevated)]/95 backdrop-blur-xl",
        "lg:w-[340px] lg:shrink-0 lg:bg-[var(--color-bg-elevated)]/40",
      )}
    >
      <div className="space-y-8 px-5 py-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[var(--color-emerald-glow)] shadow-[0_0_8px_var(--color-emerald-glow)]" />
              <h2 className="text-sm font-semibold tracking-tight">
                Phetchaburi 2046
              </h2>
            </div>
            <p className="text-[11px] text-[var(--color-fg-subtle)]">
              Energy sandbox — interactive
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setInputs(DEFAULT_INPUTS);
                toast("รีเซ็ตค่ากลับเป็น default", { icon: "↺" });
              }}
              className="rounded-md border border-[var(--color-border)] p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]"
              title="Reset to defaults"
              aria-label="Reset to defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="rounded-md border border-[var(--color-border)] p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)] lg:hidden"
                title="Close sidebar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Preset selector */}
        <Section title="Preset scenario" icon={<Flame className="h-3.5 w-3.5" />}>
          <PresetSelector
            current={detectPreset(inputs)}
            onSelect={(id) => {
              setInputs(PRESETS[id].inputs);
              toast.success(`โหลด preset: ${PRESETS[id].label}`, {
                description: PRESETS[id].description,
              });
            }}
          />
        </Section>

        {/* Season selector */}
        <Section title="ฤดูกาล" icon={<Waves className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-2 gap-1.5">
            {SEASONS.map((s) => (
              <button
                key={s.id}
                onClick={() => update("season", s.id)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-xs transition-all",
                  inputs.season === s.id
                    ? "border-[var(--color-emerald-glow)]/50 bg-[var(--color-emerald-glow)]/10 text-[var(--color-fg)]"
                    : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)]",
                )}
              >
                <span className="mr-1">{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Supply */}
        <Section title="แหล่งผลิต" icon={<Zap className="h-3.5 w-3.5" />}>
          <Field
            label="Solar"
            value={fmtPower(inputs.solarMW)}
            hint="กำลังผลิตติดตั้ง"
          >
            <Slider
              value={inputs.solarMW}
              onChange={(v) => update("solarMW", v)}
              max={10000}
              step={100}
            />
          </Field>
          <Field label="Wind" value={fmtPower(inputs.windMW)}>
            <Slider
              value={inputs.windMW}
              onChange={(v) => update("windMW", v)}
              max={5000}
              step={50}
            />
          </Field>
          <Field label="Biomass" value={fmtPower(inputs.biomassMW)}>
            <Slider
              value={inputs.biomassMW}
              onChange={(v) => update("biomassMW", v)}
              max={500}
              step={10}
            />
          </Field>
          <Field label="Hydro" value={fmtPower(inputs.hydroMW)}>
            <Slider
              value={inputs.hydroMW}
              onChange={(v) => update("hydroMW", v)}
              max={100}
              step={1}
            />
          </Field>
        </Section>

        {/* Demand modules */}
        <Section title="โหลด/ภารกิจ" icon={<Flame className="h-3.5 w-3.5" />}>
          <ModuleRow
            label="Lifestyle + EV"
            on={true}
            description={`${inputs.lifestyleGWhPerDay} GWh/วัน`}
            locked
          />
          <ModuleRow
            label="DAC (ดึงคาร์บอน)"
            on={inputs.dacOn}
            onToggle={(v) => update("dacOn", v)}
            description={`${inputs.dacTargetMtPerYear.toFixed(2)} M ton/ปี`}
          >
            <Slider
              value={inputs.dacTargetMtPerYear}
              onChange={(v) => update("dacTargetMtPerYear", v)}
              min={0}
              max={2}
              step={0.05}
              disabled={!inputs.dacOn}
            />
          </ModuleRow>
          <ModuleRow
            label="E-Methanol"
            on={inputs.methanolOn}
            onToggle={(v) => update("methanolOn", v)}
            description={`${inputs.methanolKtPerYear} kt/ปี`}
          >
            <Slider
              value={inputs.methanolKtPerYear}
              onChange={(v) => update("methanolKtPerYear", v)}
              min={0}
              max={1500}
              step={10}
              disabled={!inputs.methanolOn}
            />
          </ModuleRow>
          <ModuleRow
            label="Data Center"
            on={inputs.dataCenterOn}
            onToggle={(v) => update("dataCenterOn", v)}
            description={fmtPower(inputs.dataCenterMW)}
            icon={<Cpu className="h-3 w-3" />}
          >
            <Slider
              value={inputs.dataCenterMW}
              onChange={(v) => update("dataCenterMW", v)}
              min={0}
              max={1000}
              step={10}
              disabled={!inputs.dataCenterOn}
            />
          </ModuleRow>
          <ModuleRow
            label="Desalination"
            on={inputs.desalOn}
            onToggle={(v) => update("desalOn", v)}
            description={`${inputs.desalMm3PerYear} Mm³/ปี`}
            icon={<Droplets className="h-3 w-3" />}
          >
            <Slider
              value={inputs.desalMm3PerYear}
              onChange={(v) => update("desalMm3PerYear", v)}
              min={0}
              max={500}
              step={10}
              disabled={!inputs.desalOn}
            />
          </ModuleRow>
          <ModuleRow
            label="Plasma Waste"
            on={inputs.wasteOn}
            onToggle={(v) => update("wasteOn", v)}
            description={`${inputs.wasteTonPerDay} ton/วัน`}
            icon={<Recycle className="h-3 w-3" />}
          >
            <Slider
              value={inputs.wasteTonPerDay}
              onChange={(v) => update("wasteTonPerDay", v)}
              min={0}
              max={3000}
              step={50}
              disabled={!inputs.wasteOn}
            />
          </ModuleRow>
        </Section>

        {/* Battery */}
        <Section title="แบตเตอรี่" icon={<Battery className="h-3.5 w-3.5" />}>
          <Field
            label="ขนาด"
            value={`${inputs.batteryGWh.toFixed(1)} GWh`}
            hint="Sodium-ion storage"
          >
            <Slider
              value={inputs.batteryGWh}
              onChange={(v) => update("batteryGWh", v)}
              min={0}
              max={100}
              step={0.5}
            />
          </Field>
          <Field
            label="DoD floor"
            value={`${(inputs.batteryDoDFloor * 100).toFixed(0)}%`}
            hint="ระดับต่ำสุดที่ยอมให้ใช้"
          >
            <Slider
              value={inputs.batteryDoDFloor * 100}
              onChange={(v) => update("batteryDoDFloor", v / 100)}
              min={0}
              max={30}
              step={1}
            />
          </Field>
          <Field
            label="ราคาแบต"
            value={`฿${inputs.batteryPricePerKWh}/kWh`}
            hint="Full system (2046 projection)"
          >
            <Slider
              value={inputs.batteryPricePerKWh}
              onChange={(v) => update("batteryPricePerKWh", v)}
              min={200}
              max={3000}
              step={25}
            />
          </Field>
        </Section>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] pt-4 text-[10px] text-[var(--color-fg-subtle)]">
          <div className="flex items-center justify-between">
            <span>Scenario simulator v0.1</span>
            <Badge tone="emerald">MVP</Badge>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------- Preset detection & selector ----------

function detectPreset(inputs: SimInputs): PresetId | "custom" {
  const PRESET_KEYS: PresetId[] = ["conservative", "balanced", "aggressive"];
  for (const id of PRESET_KEYS) {
    const p = PRESETS[id].inputs;
    if (
      p.solarMW === inputs.solarMW &&
      p.windMW === inputs.windMW &&
      p.biomassMW === inputs.biomassMW &&
      p.batteryGWh === inputs.batteryGWh &&
      p.dacTargetMtPerYear === inputs.dacTargetMtPerYear &&
      p.methanolKtPerYear === inputs.methanolKtPerYear &&
      p.dataCenterMW === inputs.dataCenterMW &&
      p.desalMm3PerYear === inputs.desalMm3PerYear &&
      p.wasteTonPerDay === inputs.wasteTonPerDay
    ) {
      return id;
    }
  }
  return "custom";
}

function PresetSelector({
  current,
  onSelect,
}: {
  current: PresetId | "custom";
  onSelect: (id: PresetId) => void;
}) {
  const ids: PresetId[] = ["conservative", "balanced", "aggressive"];
  return (
    <div>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/40 p-1">
        {ids.map((id) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={cn(
              "rounded-md px-2 py-1.5 text-[11px] font-medium transition-all",
              current === id
                ? "bg-[var(--color-emerald-glow)]/15 text-[var(--color-fg)] shadow-[0_0_0_1px_oklch(0.78_0.18_155/0.35)_inset]"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]",
            )}
          >
            {PRESETS[id].label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-[var(--color-fg-subtle)]">
        {current === "custom" ? (
          <span className="text-[var(--color-amber-glow)]">
            ✱ Custom — แตะ preset เพื่อ snap กลับ
          </span>
        ) : (
          PRESETS[current].description
        )}
      </p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
        {icon}
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function ModuleRow({
  label,
  on,
  onToggle,
  description,
  icon,
  locked,
  children,
}: {
  label: string;
  on: boolean;
  onToggle?: (v: boolean) => void;
  description?: string;
  icon?: React.ReactNode;
  locked?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-2.5",
        on
          ? "border-[var(--color-border)] bg-[var(--color-bg-hover)]/40"
          : "border-[var(--color-border)]/50 bg-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon}
          <span
            className={cn(
              "truncate text-xs font-medium",
              on ? "text-[var(--color-fg)]" : "text-[var(--color-fg-subtle)]",
            )}
          >
            {label}
          </span>
        </div>
        {locked ? (
          <Badge tone="neutral">locked</Badge>
        ) : (
          onToggle && <Switch checked={on} onChange={onToggle} />
        )}
      </div>
      {description && (
        <div className="tabular text-[10px] text-[var(--color-fg-subtle)]">
          {description}
        </div>
      )}
      {children}
    </div>
  );
}
