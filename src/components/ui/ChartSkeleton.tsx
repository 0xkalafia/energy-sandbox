import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface Props {
  title?: string;
  height?: number;
  showHeader?: boolean;
}

export function ChartSkeleton({
  title = "Loading…",
  height = 300,
  showHeader = true,
}: Props) {
  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <div className="mt-1 h-3 w-40 animate-pulse rounded bg-[var(--color-border)]" />
        </CardHeader>
      )}
      <CardContent>
        <div
          className="relative w-full overflow-hidden rounded-lg bg-[var(--color-bg-hover)]/30"
          style={{ height }}
        >
          {/* Shimmer */}
          <div className="absolute inset-0 animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
          {/* Faux axis ticks */}
          <div className="absolute inset-y-4 left-2 flex flex-col justify-between">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-2 w-6 rounded bg-[var(--color-border)]/60" />
            ))}
          </div>
          {/* Faux baseline */}
          <div className="absolute right-2 left-12 bottom-4 h-px bg-[var(--color-border)]" />
        </div>
      </CardContent>
    </Card>
  );
}
