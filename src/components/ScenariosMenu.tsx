import { useEffect, useRef, useState } from "react";
import { Save, Download, Trash2, FolderOpen, FileJson, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  deleteScenario,
  downloadHourlyCSV,
  downloadScenarioJSON,
  listScenarios,
  parseScenarioJSON,
  saveScenario,
  type SavedScenario,
} from "@/lib/scenarios";
import type { HourlyPoint, SimInputs } from "@/data/types";

interface Props {
  inputs: SimInputs;
  hourly: HourlyPoint[];
  setInputs: (i: SimInputs) => void;
}

export function ScenariosMenu({ inputs, hourly, setInputs }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    try {
      const next = parseScenarioJSON(await file.text());
      setInputs(next);
      setOpen(false);
      toast.success(`นำเข้า "${file.name}"`);
    } catch {
      toast.error("ไฟล์ JSON ไม่ถูกต้อง");
    }
  };

  useEffect(() => {
    if (open) setSaved(listScenarios());
  }, [open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const doSave = () => {
    const n = name.trim();
    if (!n) {
      toast.error("ตั้งชื่อ scenario ก่อน");
      return;
    }
    setSaved(saveScenario(n, inputs));
    setName("");
    toast.success(`บันทึก "${n}"`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] backdrop-blur-md transition-all hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]"
        title="Save / load / export scenarios"
        aria-label="Scenarios menu"
      >
        <FolderOpen className="h-3 w-3" />
        <span className="hidden sm:inline">Scenarios</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/97 shadow-2xl backdrop-blur-xl">
          {/* Save row */}
          <div className="border-b border-[var(--color-border)] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
              Save current
            </p>
            <div className="flex items-center gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSave()}
                placeholder="ชื่อ scenario…"
                className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-emerald-glow)]/50 focus:outline-none"
              />
              <button
                onClick={doSave}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-emerald-glow)]/40 bg-[var(--color-emerald-glow)]/10 px-2 py-1.5 text-[11px] font-medium text-[var(--color-fg)] hover:bg-[var(--color-emerald-glow)]/20"
              >
                <Save className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Saved list */}
          <div className="max-h-56 overflow-y-auto p-2">
            {saved.length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-[var(--color-fg-subtle)]">
                ยังไม่มี scenario ที่บันทึกไว้
              </p>
            ) : (
              saved.map((s) => (
                <div
                  key={s.name}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--color-bg-hover)]"
                >
                  <button
                    onClick={() => {
                      setInputs(s.inputs);
                      setOpen(false);
                      toast.success(`โหลด "${s.name}"`);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FolderOpen className="h-3 w-3 shrink-0 text-[var(--color-fg-subtle)]" />
                    <span className="truncate text-xs text-[var(--color-fg)]">
                      {s.name}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setSaved(deleteScenario(s.name));
                      toast("ลบแล้ว", { icon: "🗑" });
                    }}
                    className="rounded p-1 text-[var(--color-fg-subtle)] opacity-0 transition-opacity hover:text-[var(--color-rose-glow)] group-hover:opacity-100"
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Import / Export row */}
          <div className="border-t border-[var(--color-border)] p-2">
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
              Import / Export
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={onImportFile}
              className="hidden"
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]"
              >
                <Upload className="h-3 w-3" />
                <FileJson className="h-3 w-3" />
                Import
              </button>
              <ExportBtn
                icon={<FileJson className="h-3 w-3" />}
                label="JSON"
                onClick={() => {
                  downloadScenarioJSON(inputs, name || "scenario");
                  toast.success("ดาวน์โหลด scenario.json");
                }}
              />
              <ExportBtn
                icon={<FileSpreadsheet className="h-3 w-3" />}
                label="CSV"
                onClick={() => {
                  downloadHourlyCSV(hourly, name || "hourly");
                  toast.success("ดาวน์โหลด hourly.csv");
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-fg)]",
      )}
    >
      <Download className="h-3 w-3" />
      {icon}
      {label}
    </button>
  );
}
