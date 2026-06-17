import Link from 'next/link'

import { ExportCsvButton } from '@/components/export-csv-button'
import { MeiDisclaimer } from '@/components/mei-disclaimer'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { MeiReport } from '@/lib/mei/csv'
import { DASN_DEADLINE } from '@/lib/mei/rules'
import { formatCents } from '@/lib/money'

/** pt-BR month names — the DASN deadline label derives its month from rules.ts. */
const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** "31 de maio de {ano+1}" — built from DASN_DEADLINE (never a hardcoded date). */
function deadlineLabel(reportYear: number): string {
  const month = MONTH_NAMES[DASN_DEADLINE.month - 1]
  return `${DASN_DEADLINE.day} de ${month} de ${reportYear + 1}`
}

/** A label/value row in the DASN document grid (mono right-aligned value). */
function Row({
  label,
  value,
  hero = false,
}: {
  label: string
  value: string
  hero?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span
        className={
          hero
            ? 'font-mono text-[28px] font-semibold tabular-nums whitespace-nowrap'
            : 'font-mono text-sm font-semibold tabular-nums whitespace-nowrap'
        }
      >
        {value}
      </span>
    </div>
  )
}

/**
 * DasnReportView (UI-SPEC §4) — the print-friendly card with EXACTLY the DASN-SIMEI
 * fields for {ano} (MEI-04): ano-base + período + the DASN deadline reference (from
 * rules.ts), the Receita bruta total hero, the Comércio/Indústria + Serviços split
 * (two figures that sum to the total), and Empregado no ano (Sim/Não from
 * has_employee). No teal, no decorative color — it reads like a document. The
 * MeiDisclaimer is in the report header so it survives print (MEI-06). When no
 * mei_start_date is set, an info row links to Configurações (the applicable-limit
 * reference needs it) but the DASN totals — which don't — still render.
 */
export function DasnReportView({
  report,
  hasStartDate,
}: {
  report: MeiReport
  /** False when no mei_start_date is configured — the limit reference is unavailable. */
  hasStartDate: boolean
}) {
  const { year, grossCents, comercioCents, servicosCents, hasEmployee } = report
  const noRevenue = Number(grossCents) === 0

  return (
    <div data-print-root className="flex flex-col gap-6">
      {/* The disclaimer rides in the report header so it survives print (MEI-06). */}
      <MeiDisclaimer />

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">
              Ano-base {year} · período jan–dez/{year}
            </h2>
            <p className="text-muted-foreground text-xs">
              Prazo de entrega: {deadlineLabel(year)}.
            </p>
          </div>

          <Separator />

          <Row
            label="Receita bruta total"
            value={formatCents(grossCents)}
            hero
          />

          {noRevenue ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma receita registrada em {year}.
            </p>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-3">
            <Row
              label="Comércio, indústria e transporte"
              value={formatCents(comercioCents)}
            />
            <Row
              label="Prestação de serviços"
              value={formatCents(servicosCents)}
            />
          </div>

          <Separator />

          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground text-sm">
              Empregado durante o ano-calendário
            </span>
            <span className="text-sm font-semibold">
              {hasEmployee ? 'Sim' : 'Não'}
            </span>
          </div>

          {!hasStartDate ? (
            <p className="text-muted-foreground text-sm">
              Defina a data de início do MEI em{' '}
              <Link href="/mei/configuracoes" className="underline">
                Configurações
              </Link>{' '}
              para ver o limite aplicável do ano.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Actions are not part of the printed document. */}
      <div data-print="hide" className="flex flex-wrap gap-2">
        <ExportCsvButton report={report} />
      </div>
    </div>
  )
}
