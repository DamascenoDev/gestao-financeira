import { CardSkeleton } from '@/components/card-skeleton'

/**
 * MEI dashboard loading boundary (UI-08). The layout chrome stays visible while the
 * RSC streams (it reads mei_settings + v_mei_year_summary); the page h1 holds its
 * place and the gauge/summary card region is filled with a CardSkeleton. Skeletons,
 * never spinners (UI-SPEC §Polish).
 */
export default function MeiLoading() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">MEI</h1>

      <CardSkeleton count={1} />
    </section>
  )
}
