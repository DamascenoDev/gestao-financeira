import { Skeleton } from '@/components/ui/skeleton'

/**
 * CardSkeleton — loading placeholder for card grids (e.g. the MEI gauge card, any
 * summary-card cluster). Renders `count` card-shaped placeholders in a responsive
 * grid.
 *
 * UI-SPEC §Polish: skeletons, never spinners. Built on the shadcn `Skeleton`
 * primitive; under `prefers-reduced-motion` the pulse is suppressed (opacity-only
 * static block).
 */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="motion-reduce:animate-none grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          data-testid="card-skeleton-card"
          className="flex flex-col gap-3 rounded-xl border p-6"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}
