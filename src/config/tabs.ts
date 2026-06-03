/** Single source of truth for the main tab set — consumed by the TabsList,
 *  the 1–7 keyboard shortcuts, and the command palette. */
export interface TabDef {
  id: string;
  label: string;
}

export const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "flow", label: "Flow" },
  { id: "hourly", label: "Hourly" },
  { id: "battery", label: "Battery" },
  { id: "resilience", label: "Resilience" },
  { id: "carbon", label: "Carbon" },
  { id: "finance", label: "Finance" },
  { id: "analysis", label: "Analysis" },
];

export const TAB_IDS = TABS.map((t) => t.id);
