import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * TableSkeleton — loading placeholder for the dense transaction grids (Extrato,
 * import review, NF list). Mirrors the extrato-table column shape: a select gutter
 * (`w-10`), a narrow Data column (`w-16`), then Descrição / Categoria / Valor.
 *
 * UI-SPEC §Polish: skeletons, never spinners. Built on the shadcn `Skeleton`
 * primitive (`animate-pulse rounded-md bg-muted`), which under
 * `prefers-reduced-motion` falls back to opacity-only (the primitive's pulse is the
 * only animation; reduced-motion users see the static muted block). Keep the page
 * chrome (header, filters, nav) visible — this fills only the table body region.
 */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="motion-reduce:animate-none w-full overflow-hidden rounded-lg ring-1 ring-foreground/10"
      aria-hidden="true"
    >
      {/* Header row — mirrors the extrato column widths. */}
      <div
        data-testid="table-skeleton-header"
        className="flex items-center gap-3 border-b px-4 py-3"
      >
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="hidden h-4 w-28 sm:block" />
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Body rows. */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          data-testid="table-skeleton-row"
          className={cn(
            'flex items-center gap-3 px-4 py-3',
            i < rows - 1 && 'border-b',
          )}
        >
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-6 w-28 rounded-full sm:block" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
