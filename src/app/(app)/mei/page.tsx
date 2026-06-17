import Link from 'next/link'

import { LimiteGauge } from '@/components/limite-gauge'
import { LimiteStatusBadge } from '@/components/limite-status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { toYearOrCurrent } from '@/lib/month'
import { formatCents } from '@/lib/money'
import { applicableLimitCents, bandCeilingCents } from '@/lib/mei/limit'
import { meiStatusTokens } from '@/lib/mei/presentation'
import { isNearLimit, meiStatus } from '@/lib/mei/status'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'

/**
 * MEI dashboard (RSC). The headline screen: receita bruta acumulada do ano vs the
 * COMPUTED applicable limit (MEI-02), the tiered status (MEI-02), the 80%/100% alert
 * (MEI-05). All numbers come from v_mei_year_summary + the mei/limit|status libs — no
 * fiscal literal lives here (the grep gate forbids the teto/banda digits in this file).
 *
 * Two reads, because the view JOINs invoices×settings and only yields a row when the
 * year has NFs: (1) mei_settings detects whether the MEI is configured at all (→ the
 * "Configure seu MEI" empty state, never a wrong/zero limit); (2) the view row, when
 * present, supplies the authoritative gross/limit/ratio. When configured-but-no-NFs,
 * gross = 0 and the applicable limit is computed from mei_start_date via limit.ts.
 */
const PERCENT_FMT = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export default async function MeiDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const { ano: anoParam } = await searchParams
  const ano = toYearOrCurrent(anoParam)

  const supabase = await createClient()

  // (1) Is the MEI configured? Without a start date the limit cannot be computed.
  const { data: settings } = await supabase
    .from('mei_settings')
    .select('mei_start_date')
    .maybeSingle()

  if (!settings) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">MEI</h1>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Configure seu MEI para começar</EmptyTitle>
            <EmptyDescription>
              Informe a data de início do seu MEI para calcularmos o limite
              aplicável e acompanhar seu faturamento.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/mei/configuracoes">Configurar MEI</Link>} />
          </EmptyContent>
        </Empty>
      </section>
    )
  }

  // (2) The authoritative consolidated row for the selected year (may be absent when
  // there are no NFs yet — then gross = 0 and we compute the limit from the start date).
  const { data: summary } = await supabase
    .from('v_mei_year_summary')
    .select('gross_cents, applicable_limit_cents, band_ceiling_cents, ratio_bp')
    .eq('year', ano)
    .maybeSingle()

  const grossCents = summary?.gross_cents ?? 0
  const limitCents =
    summary?.applicable_limit_cents ??
    applicableLimitCents(ano, settings.mei_start_date)
  const bandCents = summary?.band_ceiling_cents ?? bandCeilingCents(limitCents)
  // ratio_bp is null before the opening year (no applicable limit). For the
  // configured-but-no-NFs case the view has no row, so derive it (0 when there is a limit).
  const ratioBp =
    summary !== null && summary !== undefined
      ? summary.ratio_bp
      : limitCents === 0
        ? null
        : 0

  const status = meiStatus(ratioBp, grossCents, bandCents)
  const tokens = meiStatusTokens(status)

  const openingYear = Number(settings.mei_start_date.slice(0, 4))
  const isOpeningYear = ano === openingYear
  const limitLabel = limitLabelFor(ano, settings.mei_start_date, isOpeningYear)
  const percentText = ratioBp === null ? '—' : PERCENT_FMT.format(ratioBp / 10000)
  const remainingCents = Math.max(limitCents - grossCents, 0)
  // Strictly above the limit (LR-01): exactly-at-limit (ratioBp === 10000) is still
  // within, so the "Acima do limite" alert copy and the remaining-to-limit line must
  // stay aligned with meiStatus, which treats <= 100% as âmbar.
  const overLimit = ratioBp !== null && ratioBp > 10000
  const overBand = status === 'vermelho-fora'
  const noNfs = grossCents === 0
  // Pre-opening edge (LR-03): there is no applicable limit yet (ratioBp === null)
  // but the year already has recorded gross. meiStatus → 'verde'/"Dentro do limite",
  // which alone is misleading next to a non-zero hero figure. Surface why that
  // revenue does not count toward the {ano} limit instead of leaving it unexplained.
  const preOpeningWithRevenue = ratioBp === null && !noNfs

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">MEI</h1>

      <Card>
        <CardContent className="flex flex-col gap-4">
          {/* Hero: receita bruta acumulada do ano, colored by the current status. */}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              Receita bruta em {ano}
            </span>
            <span
              className={cn(
                'font-mono text-[28px] font-semibold tabular-nums',
                tokens.text,
              )}
            >
              {formatCents(grossCents)}
            </span>
          </div>

          {/* Computed applicable-limit line — never a bare R$ 81.000. */}
          <p className="text-muted-foreground text-sm">{limitLabel}</p>

          {/* The gauge + the true % (may read >100%). */}
          <div className="flex items-center gap-3">
            <LimiteGauge
              grossCents={grossCents}
              limitCents={limitCents}
              ratioBp={ratioBp}
              status={status}
              className="flex-1"
            />
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                tokens.text,
              )}
            >
              {percentText}
            </span>
          </div>

          <LimiteStatusBadge status={status} />

          {/* Pre-opening edge (LR-03): revenue recorded before the MEI's opening
              year does not count toward this year's limit — explain the verde state
              rather than leaving "Dentro do limite" misleading next to a non-zero hero. */}
          {preOpeningWithRevenue ? (
            <p className="text-muted-foreground text-sm">
              As notas registradas em {ano} são anteriores ao início do seu MEI e
              não contam para o limite deste ano.
            </p>
          ) : null}

          {/* Remaining-to-limit line while under 100%. */}
          {!overLimit && ratioBp !== null ? (
            <p className="text-muted-foreground text-sm">
              Faltam{' '}
              <span className="font-mono tabular-nums">
                {formatCents(remainingCents)}
              </span>{' '}
              para o limite.
            </p>
          ) : null}

          {/* Alert affordance (MEI-05): the dashboard IS the alert surface. */}
          {isNearLimit(ratioBp) && !overLimit ? (
            <p className="text-consumption text-sm">
              Você atingiu {percentText} do seu limite de {ano}. Acompanhe seus
              próximos registros.
            </p>
          ) : null}
          {overLimit && !overBand ? (
            <p className="text-destructive text-sm">
              Acima do limite. Dentro da tolerância de 20% você migra para o
              Simples Nacional no ano seguinte.
            </p>
          ) : null}
          {overBand ? (
            <p className="text-destructive text-sm">
              Acima da tolerância de 20% — risco de desenquadramento retroativo a
              janeiro de {ano}. Procure um contador.
            </p>
          ) : null}

          {/* Empty (configured, no NFs in {ano}) hint. */}
          {noNfs ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma nota fiscal registrada em {ano}. Registre sua primeira NF.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Quick links. */}
      <div className="flex flex-wrap gap-2">
        <Button render={<Link href="/mei/notas">Registrar NF</Link>} />
        <Button
          variant="outline"
          render={<Link href="/mei/relatorio">Relatório DASN-SIMEI</Link>}
        />
        <Button
          variant="outline"
          render={<Link href="/mei/configuracoes">Configurações</Link>}
        />
      </div>
    </section>
  )
}

/**
 * The computed applicable-limit label (UI-SPEC Copywriting Contract). Proportional
 * copy in the opening year (n active months from the start month), full-year copy
 * otherwise. Always carries the COMPUTED value — never a static "R$ 81.000".
 */
function limitLabelFor(
  ano: number,
  meiStartDate: string,
  isOpeningYear: boolean,
): string {
  const limitCents = applicableLimitCents(ano, meiStartDate)
  const value = formatCents(limitCents)
  if (limitCents === 0) {
    return `Limite aplicável ${ano} · ${value} (MEI iniciado após este ano)`
  }
  if (isOpeningYear) {
    const openingMonth = Number(meiStartDate.slice(5, 7))
    const months = 12 - openingMonth + 1
    const monthName = MONTH_NAMES[openingMonth - 1]
    return `Limite proporcional ${ano} · ${value} — ${months} ${
      months === 1 ? 'mês' : 'meses'
    } a partir de ${monthName}/${ano}`
  }
  return `Limite anual ${ano} · ${value}`
}

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
