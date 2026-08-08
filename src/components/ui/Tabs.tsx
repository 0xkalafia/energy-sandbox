import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Wrapped rather than re-exported so every export in this file is a real
// component (keeps react-refresh happy and the API identical).
export function Tabs(
  props: React.ComponentProps<typeof TabsPrimitive.Root>,
) {
  return <TabsPrimitive.Root {...props} />;
}

export function TabsList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)]",
        "bg-[var(--color-bg-elevated)]/60 p-1 backdrop-blur-md",
        className,
      )}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium",
        "text-[var(--color-fg-muted)] transition-all",
        "hover:text-[var(--color-fg)]",
        "data-[state=active]:bg-[var(--color-bg-hover)]",
        "data-[state=active]:text-[var(--color-fg)]",
        "data-[state=active]:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-emerald-glow)]/40",
      )}
      aria-label={typeof children === "string" ? `Switch to ${children} tab` : undefined}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent(
  props: React.ComponentProps<typeof TabsPrimitive.Content>,
) {
  return <TabsPrimitive.Content {...props} />;
}
