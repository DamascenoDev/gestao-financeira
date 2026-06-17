import { Skeleton } from '@/components/ui/skeleton'

/**
 * ChartSkeleton — loading placeholder for the dashboard data-viz blocks
 * (ReceitaGastoChart / CategoryDistributionChart). A fixed-aspect box matching the
 * chart footprint so the layout does not jump when the real chart streams in.
 *
 * UI-SPEC §Polish: skeletons, never spinners. Built on the shadcn `Skeleton`
 * primitive; `prefers-reduced-motion` suppresses the pulse (opacity-only static
 * block).
 */
export function ChartSkeleton() {
  return (
    <div
      data-testid="chart-skeleton"
      className="motion-reduce:animate-none flex flex-col gap-3"
      aria-hidden="true"
    >
      {/* The plot area — a fixed-height shimmer box (mirrors the chart's footprint). */}
      <Skeleton className="h-[240px] w-full rounded-lg" />
      {/* A short legend strip below. */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}
