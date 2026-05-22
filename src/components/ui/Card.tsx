import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)]",
        "bg-[var(--color-bg-elevated)]/60 backdrop-blur-md",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]",
        "transition-colors hover:border-[var(--color-border-strong)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn("px-5 pt-5 pb-2", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: CardProps) {
  return (
    <h3
      className={cn(
        "text-sm font-medium tracking-tight text-[var(--color-fg-muted)]",
        className,
      )}
      {...rest}
    >
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn("px-5 pb-5", className)} {...rest}>
      {children}
    </div>
  );
}
