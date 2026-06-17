import { TableSkeleton } from '@/components/table-skeleton'

/**
 * Extrato loading boundary (UI-08). The layout chrome (sidebar, header, bottom-nav)
 * stays visible while the RSC streams; the page h1 holds its place and the dense
 * transaction table is filled with a TableSkeleton mirroring the extrato columns.
 * Skeletons, never spinners (UI-SPEC §Polish).
 */
export default function ExtratoLoading() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Extrato</h1>
      </div>

      <TableSkeleton rows={10} />
    </section>
  )
}
