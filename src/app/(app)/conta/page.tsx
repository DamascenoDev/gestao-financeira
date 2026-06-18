import Link from 'next/link'

import { AccountDeleteZone } from '@/components/delete-account-form'
import { ExportDataButton } from '@/components/export-data-button'
import { ExportTransactionsButton } from '@/components/export-transactions-button'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { centsToBigInt } from '@/lib/money'
import { monthBounds, toMonthKeyOrCurrent } from '@/lib/month'
import { createClient } from '@/lib/supabase/server'
import type { TransactionCsvRow } from '@/lib/transactions/csv'
import type { Database } from '@/types/database.types'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

/** Narrow the DB `kind` (string) to the CSV Tipo union; unknown → null. */
function toCategoryKind(
  kind: string | undefined,
): TransactionCsvRow['category_kind'] {
  return kind === 'consumo' || kind === 'alocacao' ? kind : null
}

/**
 * Privacidade e conta (UI-SPEC §1) — the LGPD surface shell. This plan (06-02) stands
 * up the screen + nav and ships the transactions CSV affordance scoped to the current
 * ?mes window (read the same way the Extrato does: createClient + monthBounds + the
 * month's transactions joined to categories for category_name/kind). 06-03 fills the
 * marked placeholders below: the full LGPD bundle button (Section A completion) and the
 * destructive AccountDeleteZone (Section B). No money hero on this screen.
 */
export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = toMonthKeyOrCurrent(params.mes)

  const supabase = await createClient()
  const { first, last } = monthBounds(mes)

  // Active categories → point-in-time name + kind for the CSV Tipo column.
  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id, name, kind')
    .eq('is_archived', false)
  const categoryById = new Map(
    (categoriesData ?? []).map((c) => [c.id, c]),
  )

  // The current month's RLS-scoped transactions (the CSV matches the ?mes window).
  const { data: txData } = await supabase
    .from('transactions')
    .select('occurred_on, description, amount_cents, category_id')
    .gte('occurred_on', first)
    .lte('occurred_on', last)
    .order('occurred_on', { ascending: false })

  const csvRows: TransactionCsvRow[] = (
    (txData ?? []) as Pick<
      TransactionRow,
      'occurred_on' | 'description' | 'amount_cents' | 'category_id'
    >[]
  ).map((t) => {
    const cat = t.category_id ? categoryById.get(t.category_id) : undefined
    return {
      occurred_on: t.occurred_on,
      description: t.description,
      category_name: cat?.name ?? '',
      category_kind: toCategoryKind(cat?.kind),
      // MD-04: carry centavos as bigint, never via a lossy Number() cast.
      amount_cents: centsToBigInt(t.amount_cents),
    }
  })

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Privacidade e conta</h1>
        <p className="text-sm text-muted-foreground">
          Exporte ou apague seus dados a qualquer momento.
        </p>
      </div>

      {/* Section A — Exportar meus dados (DataExportSection). 06-03 adds the full
          LGPD bundle button (ExportDataButton) above the transactions affordance. */}
      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Exportar meus dados</h2>
          <p className="text-sm text-muted-foreground">
            Baixe uma cópia completa de tudo o que você registrou — em formato
            aberto (JSON + CSVs).
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Inclui: receitas, transações, categorias, metas, reservas e
          movimentações, dados do MEI e padrões de classificação aprendidos.
        </p>
        <p className="text-xs text-muted-foreground">
          Os arquivos das faturas em si não entram no pacote; baixe-os pelo
          extrato quando precisar.
        </p>

        {/* The full LGPD bundle (DATA-02) — the primary export affordance. The
            secret never reaches the client: exportMyData assembles the bundle
            server-side via the RLS client. */}
        <ExportDataButton />

        {/* The transactions CSV is the subordinate affordance for users who want
            just the current month's ledger. */}
        <div className="flex flex-col gap-1">
          <ExportTransactionsButton rows={csvRows} mes={mes} />
          <p className="text-xs text-muted-foreground">
            Exporta apenas as transações do mês selecionado.
          </p>
        </div>
      </Card>

      {/* Entry-point — Configurações de IA (BYOK). A simple Card linking to the
          dedicated /conta/configuracoes-ia surface; NO new sidebar item (setup is
          rare). The key never touches this page — it only routes there. */}
      <Card className="gap-4 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Configurações de IA</h2>
          <p className="text-sm text-muted-foreground">
            Escolha seu provedor (Gemini ou Claude) e cadastre sua chave para
            classificar gastos automaticamente.
          </p>
        </div>
        <Button
          variant="outline"
          className="self-start"
          render={<Link href="/conta/configuracoes-ia">Abrir configurações de IA</Link>}
        />
      </Card>

      {/* Section B — Apagar conta e dados (AccountDeleteZone). lg-separated from
          Section A via the section's gap-8. The persistent border-destructive danger
          zone with the type-to-confirm APAGAR dialog (confirm disabled until exact
          match, initial focus on Cancelar, sign-out after success). */}
      <AccountDeleteZone />
    </section>
  )
}
