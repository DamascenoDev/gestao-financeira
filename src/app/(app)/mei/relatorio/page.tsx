import { DasnReportView } from '@/components/dasn-report-view'
import { PrintButton } from '@/components/print-button'
import type { MeiReport } from '@/lib/mei/csv'
import { applicableLimitCents } from '@/lib/mei/limit'
import { toYearOrCurrent } from '@/lib/month'
import { createClient } from '@/lib/supabase/server'

/**
 * /mei/relatorio (RSC) — the consolidated, print-friendly, exportable annual report
 * with EXACTLY the DASN-SIMEI fields for ?ano (MEI-04). Reads the v_mei_year_summary
 * row for the year (RLS + security_invoker, T-05-09); the view JOINs invoices×settings
 * and only yields a row when the year has NFs, so a zero-revenue year still renders a
 * valid report with zeros (a MEI with no revenue still declares — never blocked). When
 * no mei_start_date is configured the applicable-limit reference is unavailable, but
 * the DASN totals (which don't need it) still render. The disclaimer comes from the
 * DasnReportView header (so it survives print, MEI-06) AND the segment layout.
 */
export default async function MeiRelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const { ano: anoParam } = await searchParams
  const ano = toYearOrCurrent(anoParam)

  const supabase = await createClient()

  const [{ data: summary, error: summaryError }, { data: settings }, { data: flag }] =
    await Promise.all([
      supabase
        .from('v_mei_year_summary')
        .select(
          'gross_cents, comercio_cents, servicos_cents, applicable_limit_cents',
        )
        .eq('year', ano)
        .maybeSingle(),
      supabase.from('mei_settings').select('mei_start_date').maybeSingle(),
      supabase
        .from('mei_year_flags')
        .select('has_employee')
        .eq('year', ano)
        .maybeSingle(),
    ])

  if (summaryError) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Relatório DASN-SIMEI</h1>
        <p className="text-sm text-destructive">
          Não foi possível gerar o relatório. Tente recarregar a página.
        </p>
      </section>
    )
  }

  const hasStartDate = !!settings?.mei_start_date
  // The applicable limit is computed off mei_start_date when the view has no row
  // (zero-revenue year); 0 when the MEI is unconfigured.
  const applicableLimit =
    summary?.applicable_limit_cents ??
    (hasStartDate
      ? applicableLimitCents(ano, settings!.mei_start_date)
      : 0)

  const report: MeiReport = {
    year: ano,
    grossCents: summary?.gross_cents ?? 0,
    comercioCents: summary?.comercio_cents ?? 0,
    servicosCents: summary?.servicos_cents ?? 0,
    hasEmployee: flag?.has_employee ?? false,
    applicableLimitCents: applicableLimit,
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4" data-print="hide">
        <h1 className="text-xl font-semibold">Relatório DASN-SIMEI</h1>
        <PrintButton />
      </div>

      <DasnReportView report={report} hasStartDate={hasStartDate} />
    </section>
  )
}
