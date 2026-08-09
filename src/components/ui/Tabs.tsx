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
  // Ten tabs don't fit a phone. Left to itself the inline-flex list just takes
  // the width it wants and drags the whole page sideways with it — at 390px
  // the content pane ended up 790px wide and *everything* scrolled, header
  // included. The list scrolls inside this wrapper instead; the scrollbar is
  // hidden because on a phone you swipe, and on a desktop the list fits.
  return (
    <div
      className={cn(
        "overflow-x-auto [scrollbar-width:none]",
        "[&::-webkit-scrollbar]:hidden",
      )}
    >
      <TabsPrimitive.List
        className={cn(
          "inline-flex w-max items-center gap-1 rounded-lg border border-[var(--color-border)]",
          "bg-[var(--color-bg-elevated)]/60 p-1 backdrop-blur-md",
          className,
        )}
      >
        {children}
      </TabsPrimitive.List>
    </div>
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
        "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
        // Comfortable to hit with a thumb; no effect with a mouse.
        "pointer-coarse:min-h-[36px]",
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
