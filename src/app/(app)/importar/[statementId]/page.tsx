import Link from 'next/link'

import {
  ImportReviewTable,
  type CarroOption,
  type ReviewCategory,
  type ReviewRow,
} from '@/components/import-review-table'
import { ImportSummaryHeader } from '@/components/import-summary-header'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { createClient } from '@/lib/supabase/server'
import type { ParsedReviewRow } from '@/lib/parsers/types'
import type { Database } from '@/types/database.types'

type CategoryRow = Database['public']['Tables']['categories']['Row']

/** The summary jsonb Plan 02 persisted on the statement (N/M/K/J + descartadas). */
interface PersistedSummary {
  total: number
  novas: number
  naoClassificadas: number
  duplicadas: number
  descartadas: number
}

/**
 * Import review screen (UI-SPEC §3) — the core pre-persist surface. RSC: reads the
 * parsed rows + summary jsonb Plan 02 persisted on the statement (by statementId,
 * RLS-scoped to the owner — no re-download/re-parse), and renders the
 * ImportSummaryHeader + ImportReviewTable. NOTHING is in `transactions` yet; the
 * client-side review grid mutates in memory until "Confirmar importação" drives
 * confirmImport (persist + learn + reserva aporte). States: all-classified calm
 * confirm, needs-attention (K>0), re-upload/all-duplicates (M===0 → the duplicate
 * empty state), and an inline load error.
 */
export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ statementId: string }>
}) {
  const { statementId } = await params
  const supabase = await createClient()

  // The statement carries the parsed rows + summary (RLS scopes to the owner).
  const { data: statement, error } = await supabase
    .from('statements')
    .select('id, parsed_rows, summary, status')
    .eq('id', statementId)
    .maybeSingle()

  if (error) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-xl font-semibold">Revisar importação</h1>
        <p className="text-sm text-destructive">
          Não foi possível carregar a revisão. Tente recarregar a página.
        </p>
      </section>
    )
  }

  if (!statement) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-xl font-semibold">Revisar importação</h1>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Importação não encontrada</EmptyTitle>
            <EmptyDescription>
              Este arquivo não está disponível para revisão.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/importar">Voltar para importar</Link>} />
          </EmptyContent>
        </Empty>
      </section>
    )
  }

  const parsedRows = (statement.parsed_rows ?? []) as unknown as ParsedReviewRow[]
  const summary = (statement.summary ?? {
    total: 0,
    novas: 0,
    naoClassificadas: 0,
    duplicadas: 0,
    descartadas: 0,
  }) as unknown as PersistedSummary

  // Text-read-but-0-rows (PDF-04, UI-SPEC §4): the file WAS read (not the image-only
  // hard block, which returns { error } upstream in 13-03 and never reaches this route
  // with a statement), but no transaction line matched (likely a non-Santander layout).
  // Show the honest 0/J header + the "Nenhuma transação reconhecida" Empty so the user
  // sees the file was read and can choose CSV/OFX — NOT a silent empty grid, NOT the
  // all-duplicates copy (which only applies when duplicates collapsed the rows away).
  if (parsedRows.length === 0 && summary.duplicadas === 0) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-xl font-semibold">Revisar importação</h1>
        <ImportSummaryHeader summary={summary} />
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhuma transação reconhecida</EmptyTitle>
            <EmptyDescription>
              Lemos o arquivo, mas não reconhecemos nenhuma linha de transação. Se for
              de outro banco, envie o CSV ou OFX dele.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/importar">Voltar para importar</Link>} />
          </EmptyContent>
        </Empty>
      </section>
    )
  }

  // Re-upload / all-duplicates: nothing new to confirm. Show the duplicate empty state.
  if (parsedRows.length === 0 || summary.novas === 0) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-xl font-semibold">Revisar importação</h1>
        <ImportSummaryHeader summary={summary} />
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nada novo neste arquivo</EmptyTitle>
            <EmptyDescription>
              Todas as {summary.duplicadas} transações deste arquivo já estão no seu
              extrato. Nada foi duplicado.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/extrato">Voltar para o extrato</Link>} />
          </EmptyContent>
        </Empty>
      </section>
    )
  }

  // The active categories (inline + bulk classify options). is_reserva drives the
  // "Qual reserva?" sub-flow (the FLAG, never the name — rename-safe).
  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id, name, color, is_reserva')
    .eq('is_archived', false)
    .order('sort', { ascending: true })
    .order('name', { ascending: true })

  const categories: ReviewCategory[] = (
    (categoriesData ?? []) as Pick<
      CategoryRow,
      'id' | 'name' | 'color' | 'is_reserva'
    >[]
  ).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    isReserva: c.is_reserva,
  }))

  // The user's reservas feed the conditional "Qual reserva?" picker (RSV-06).
  const { data: reservasData } = await supabase
    .from('v_reserva_balance')
    .select('reserva_id, nome')
    .order('nome', { ascending: true })
  const reservas = (reservasData ?? [])
    .filter(
      (r): r is { reserva_id: string; nome: string } =>
        r.reserva_id !== null && r.nome !== null,
    )
    .map((r) => ({ id: r.reserva_id, nome: r.nome }))

  // The user's non-archived carros feed the per-row "Carro" selector (CAR-02). RLS
  // scopes to the owner; mirror the carros page query shape (id + apelido).
  const { data: carrosData } = await supabase
    .from('carros')
    .select('id, apelido')
    .eq('is_archived', false)
    .order('apelido', { ascending: true })
  const carros: CarroOption[] = (carrosData ?? []).map((c) => ({
    id: c.id,
    apelido: c.apelido,
  }))

  // Map the persisted parsed rows → the client review grid shape. The amount carries
  // through as integer cents (OFX) / raw BRL (CSV); confirmImport resolves it.
  const reviewRows: ReviewRow[] = parsedRows.map((r, i) => ({
    id: r.dedupe_key || `row-${i}`,
    dedupe_key: r.dedupe_key,
    occurred_on: r.occurred_on,
    amount: r.amount_cents, // OFX/CSV already normalized to integer cents at parse
    amount_cents: r.amount_cents,
    descriptor_raw: r.descriptor_raw,
    descriptor_norm: r.descriptor_norm,
    category_id: r.category_id,
    reserva_id: r.reserva_id,
    carro_id: null, // CAR-02: tagging happens in review; nothing pre-tagged at ingest
    // KW-02: derive origin from the persisted classification_source so a keyword
    // hit surfaces the 'palavra-chave' badge instead of being mislabeled 'memória'.
    // A classified parsed row only ever carries 'memória' or 'palavra-chave' at
    // parse-time (manual/IA do not apply); fall back to 'memória' for the rest.
    origin:
      r.category_id === null
        ? 'não classificada'
        : r.classification_source === 'palavra-chave'
          ? 'palavra-chave'
          : 'memória',
    is_recurring: r.is_recurring,
    // Thread the persisted PDF kind so the income-green AmountCell fires for estornos
    // (the client ReviewRow type does NOT inherit RawTransaction.kind). OFX/CSV rows
    // omit kind ⇒ default 'expense', so they stay green-free.
    kind: r.kind ?? 'expense',
    // CLSAI-07/08: thread the Phase-15 AI guess so the review grid can render the
    // "Aplicar sugestão" chip, the "IA" provenance badge, and the "baixa confiança"
    // tag. NON-binding — never applied to category_id here (no auto-commit). Absent on
    // older persisted rows ⇒ grid renders byte-identical to v1.3.
    suggestion: r.suggestion,
    // CAR-09/WR-01: thread the reverse-link guess resolved server-side at ingest (Plano 02,
    // greedy 1:1 over the user's unlinked abastecimentos under RLS). The RSC does NOT fetch
    // abastecimentos — the match already lives in parsed_rows (server is the source of truth).
    // NON-binding: the grid renders the "Vincular a {carro}" affordance on the Carro cell; the
    // user confirms (which then applies carro_id + "Combustível"). Absent ⇒ no link affordance.
    abastecimentoMatch: r.abastecimentoMatch,
  }))

  // FUEL-01: resolve the user's "Combustível" category id (rename-unsafe lookup is fine — it
  // is the system default name from migration 0040, kind consumo) so the grid can pre-fill it
  // on link-confirm (D-06). null when the account predates the backfill → the grid links the
  // carro but leaves the category untouched (degrades clean).
  const combustivelCategoryId =
    categories.find((c) => c.name === 'Combustível')?.id ?? null

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Revisar importação</h1>
      <ImportReviewTable
        statementId={statement.id}
        initialRows={reviewRows}
        serverSummary={{
          total: summary.total,
          novas: summary.novas,
          naoClassificadas: summary.naoClassificadas,
          duplicadas: summary.duplicadas,
          // Older persisted summaries may predate the descartadas field — coalesce so
          // the grid never renders `undefined` for J.
          descartadas: summary.descartadas ?? 0,
        }}
        categories={categories}
        reservas={reservas}
        carros={carros}
        combustivelCategoryId={combustivelCategoryId}
      />
    </section>
  )
}
