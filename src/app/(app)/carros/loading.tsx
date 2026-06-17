import { CardSkeleton } from '@/components/card-skeleton'

/**
 * /carros loading — streams the Phase-7 CardSkeleton grid (never a spinner) while the
 * RLS-scoped carros read resolves, so the list chrome stays visible.
 */
export default function CarrosLoading() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Carros</h1>
      </div>
      <CardSkeleton count={3} />
    </section>
  )
}
