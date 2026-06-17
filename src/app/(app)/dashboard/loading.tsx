import { ChartSkeleton } from '@/components/chart-skeleton'
import { TableSkeleton } from '@/components/table-skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Dashboard loading boundary (UI-08). Next App Router renders this while the RSC
 * streams, keeping the layout chrome (sidebar, header, bottom-nav) visible. The
 * page chrome (h1) stays put; the body — the two data-viz charts and the adherence
 * list — is filled with skeletons. Skeletons, never spinners (UI-SPEC §Polish).
 */
export default function DashboardLoading() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Metas e aderência</h1>
      </div>

      {/* Data-viz block — ChartSkeleton ×2 in the same 2-col grid as the charts. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartSkeleton />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartSkeleton />
          </CardContent>
        </Card>
      </div>

      {/* Adherence list. */}
      <TableSkeleton rows={6} />
    </section>
  )
}
