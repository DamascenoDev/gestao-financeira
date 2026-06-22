'use client'

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { Check, Sparkles, Tags, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { AmountCell } from '@/components/amount-cell'
import { CategoryBadge } from '@/components/category-badge'
import { ImportSummaryHeader, type ImportSummary } from '@/components/import-summary-header'
import { OriginBadge } from '@/components/origin-badge'
import { RecorrenteTag } from '@/components/recorrente-tag'
import { ReservaPicker, type ReservaOption } from '@/components/reserva-picker'
import {
  SelectionActionBar,
  type SelectionCategory,
} from '@/components/selection-action-bar'
import { SuggestionSlot } from '@/components/suggestion-slot'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { confirmImport } from '@/actions/import'
import { addKeywordInline } from '@/actions/category-keywords'
import { CARRO_NONE } from '@/lib/carro'
import type { AbastecimentoMatch } from '@/lib/carro/abastecimento-match'
import { compileRule, matchKeyword } from '@/lib/classifier/keywords'
import { normalizeKeyword } from '@/lib/normalize'
import { cn } from '@/lib/utils'

/** A category option for the inline + bulk classify (is_reserva drives the picker). */
export type ReviewCategory = {
  id: string
  name: string
  color: string | null
  isReserva?: boolean
}

/**
 * A carro option for the per-row "Carro" selector (CAR-02). Defined LOCALLY here (NOT
 * imported from carro-picker.tsx) so Plans 02 and 03 stay file-disjoint + parallel-safe
 * — both surface the same carro-tagging UX without sharing code.
 */
export type CarroOption = { id: string; apelido: string }

/** WR-04: the shared "Nenhum" Select sentinel (empty string is not a valid SelectItem
 *  value). Imported from lib/carro.ts so it agrees with CarroPicker + SelectionActionBar
 *  and cannot drift (it used to be a divergent `__nenhum__` literal). Never persisted. */
const NENHUM_CARRO = CARRO_NONE

/**
 * CLSAI-08: the single low-confidence threshold (tunable). A row with an AI suggestion
 * whose `confidence < LOW_CONFIDENCE` is "low confidence" → it shows the amber "baixa
 * confiança" tag and sorts first on the initial load. Exported so a unit edge can pin it.
 * Never surfaced as a number/percentage — only the tag is shown.
 */
export const LOW_CONFIDENCE = 0.6

/** A KindBadge-shaped pill (matches category-badge.tsx KindBadge markup exactly so the
 *  provenance/confidence affordances align with the existing pills in this column). */
function AffordancePill({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit items-center gap-1 rounded-4xl px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * CLSAI-07: the per-row provenance badge — mutually exclusive (the `category_id === null`
 * gate guarantees memória and IA can't both show, since a memória row has category_id set).
 *  - memória: `category_id` set AND `origin === 'memória'` → neutral pill, no icon.
 *  - palavra-chave (KW-05): `category_id` set AND `origin === 'palavra-chave'` → SAME
 *    neutral pill, no icon (deterministic/owned like memória, never the gold IA treatment).
 *  - IA: an unapplied non-null suggestion on an unclassified row → gold pill + Sparkles.
 *  - none: neither → nothing.
 * Color is never the sole signal — each pill carries its text label (a11y).
 */
function ProvenanceBadge({ row }: { row: ReviewRow }) {
  if (row.category_id !== null) {
    if (row.origin === 'memória') {
      return (
        <AffordancePill className="bg-secondary text-secondary-foreground">
          memória
        </AffordancePill>
      )
    }
    if (row.origin === 'palavra-chave') {
      return (
        <AffordancePill className="bg-secondary text-secondary-foreground">
          palavra-chave
        </AffordancePill>
      )
    }
    return null
  }
  if (row.suggestion?.categoryId) {
    return (
      <AffordancePill className="bg-primary/10 text-primary">
        <Sparkles className="size-3 shrink-0" aria-hidden />
        IA
      </AffordancePill>
    )
  }
  return null
}

/**
 * CLSAI-08: the per-row "baixa confiança" tag — shown ONLY for an unapplied AI suggestion
 * (`category_id === null` + non-null `suggestion.categoryId`) whose `confidence` is below
 * LOW_CONFIDENCE. Amber (the established "needs attention" hue in this grid), never red,
 * never a number. At/above the threshold → nothing.
 */
function ConfidenceTag({ row }: { row: ReviewRow }) {
  if (
    row.category_id === null &&
    row.suggestion?.categoryId &&
    row.suggestion.confidence < LOW_CONFIDENCE
  ) {
    return (
      <AffordancePill className="bg-consumption/10 text-consumption">
        baixa confiança
      </AffordancePill>
    )
  }
  return null
}

/** CLSAI-08: true when the row is an unapplied low-confidence AI suggestion. */
function isLowConfidenceAi(row: ReviewRow): boolean {
  return (
    row.category_id === null &&
    !!row.suggestion?.categoryId &&
    row.suggestion.confidence < LOW_CONFIDENCE
  )
}

/**
 * CLSAI-10: true when the row is an unapplied AI suggestion AT/ABOVE the threshold —
 * the "confiável" partition (mirror of isLowConfidenceAi, sharing the single
 * LOW_CONFIDENCE boundary so the two predicates never drift). This is the SINGLE home
 * for the bulk apply/count gate: it drives both confidentSuggestionCount (button
 * visibility + label) AND the applyAllSuggestions map. `>= LOW_CONFIDENCE` keeps the
 * 0.6 boundary inclusive, so a 0.6 row is confident (no amber tag) — together with the
 * tag's `< LOW_CONFIDENCE` it partitions the space with no gap/overlap at 0.6.
 */
function isConfidentPending(row: ReviewRow): boolean {
  return (
    row.category_id === null &&
    !!row.suggestion?.categoryId &&
    row.suggestion.confidence >= LOW_CONFIDENCE
  )
}

/**
 * CAR-10/D-07: true when a row carries an UNCONFIRMED reverse-link suggestion — the
 * pending partition that drives the "Vincular todos" button (visibility + count) AND the
 * per-cell affordance. A confirmed link sets `abastecimentoId` (via applyLinkToRow), so it
 * leaves this partition; a discard clears `abastecimentoMatch`, so it also leaves. SINGLE
 * home for the gate so the button count and the batch reducer never drift.
 */
function isLinkPending(row: ReviewRow): boolean {
  return !!row.abastecimentoMatch && row.abastecimentoId === undefined
}

/**
 * CLSAI-08: order low-confidence AI rows FIRST while preserving the prior relative order
 * for every other row (stable partition — NOT a re-sort of the tail). Returns a NEW array;
 * never mutates the input. The caller applies it ONLY when AI suggestions exist, so the
 * no-suggestions path stays byte-identical to v1.3.
 */
export function lowConfidenceFirst(rows: ReviewRow[]): ReviewRow[] {
  const lead: ReviewRow[] = []
  const rest: ReviewRow[] = []
  for (const r of rows) {
    if (isLowConfidenceAi(r)) lead.push(r)
    else rest.push(r)
  }
  return [...lead, ...rest]
}

/**
 * A pre-persist review row (un-persisted parsed transaction). Client-side state — a
 * stable id (dedupe_key or temp id) feeds TanStack getRowId + the eventual confirm
 * payload. category_id null = memory-miss (unclassified). reserva_id is set when the
 * chosen category is the Reserva one (RSV-06).
 */
export type ReviewRow = {
  id: string
  dedupe_key: string
  occurred_on: string // yyyy-MM-dd
  amount: number | string // integer cents (OFX) or raw BRL (CSV) — confirmImport resolves
  amount_cents: number // for display only
  descriptor_raw: string
  descriptor_norm: string
  category_id: string | null
  reserva_id: string | null
  // CAR-02: the per-row carro tag chosen in review (null = "Nenhum"/untagged). Free of
  // category — additive on persist (D4); does NOT affect origem/accent/metas.
  carro_id: string | null
  origin: 'memória' | 'palavra-chave' | 'manual' | 'não classificada'
  is_recurring: boolean
  /**
   * PDF estorno/credit marker (D-06 / UI-SPEC §Color). DISTINCT from
   * RawTransaction.kind — this client type does NOT inherit the parser contract, so
   * the route's reviewRows.map() threads `r.kind ?? 'expense'` here. A `credit` row
   * renders the income-green money token (never red); OFX/CSV rows stay `'expense'`.
   * Optional so the type is back-compat (absent ⇒ treated as expense at every read
   * site); the route threads it explicitly for the estorno-green wiring.
   */
  kind?: 'expense' | 'credit'
  /**
   * Foreign-currency flag (D-06, A1 LOW confidence — layout unobserved). When true,
   * the descriptor shows a muted `convertido` suffix (amount_cents is the BRL-converted
   * value). Optional/graceful: the grid must not break when absent.
   */
  is_foreign?: boolean
  /**
   * CLSAI-07/08: the NON-binding AI guess threaded from `ParsedReviewRow.suggestion`
   * (Phase 15). `categoryId` null = "nenhuma encaixa" (inert slot, no chip). NEVER
   * auto-applied to `category_id` — the user applies it manually (apply fills the
   * Select only; no merchant_patterns write). `confidence < LOW_CONFIDENCE` drives the
   * "baixa confiança" tag + the low-confidence-first initial sort. Optional so old
   * persisted rows + the v1.3 path stay byte-identical (absent ⇒ grid as v1.3).
   */
  suggestion?: { categoryId: string | null; confidence: number; source: 'ia' }
  /**
   * CAR-09/CAR-10: o palpite NÃO-vinculante do vínculo reverso por valor, threaded de
   * `ParsedReviewRow.abastecimentoMatch` (Plano 02). Reusa o tipo canônico de
   * `@/lib/carro/abastecimento-match` (um único shape: abastecimentoId/kind/parcelaNum?/
   * carroId/carroApelido). É só uma dica de qual abastecimento esta linha provavelmente é;
   * NUNCA é aplicado a `carro_id`/`category_id` sem confirmação (sem auto-commit, o palpite
   * permanece palpite). A coluna Carro (`InlineReviewCarroCell`, D-05) renderiza o
   * affordance confirmar/descartar enquanto este campo existe e o vínculo ainda não foi
   * confirmado/descartado. `confirmLinkRow` consome este campo para setar `carro_id` +
   * "Combustível" + os campos do vínculo abaixo; `discardLinkRow` limpa só este campo
   * (volta ao estado anterior da célula). Opcional/back-compat (absent ⇒ grid sem vínculo).
   */
  abastecimentoMatch?: AbastecimentoMatch
  /**
   * CAR-10/D-06: a ESCOLHA do vínculo após o usuário confirmar — nunca o palpite. Setado
   * por `confirmLinkRow` a partir do `abastecimentoMatch` confirmado e enviado no payload do
   * `runConfirm` (`abastecimentoId`/`abastecimentoKind`/`parcelaNum`) para o `confirmImport`
   * (Plano 03) gravar o vínculo após o insert da tx. Ausente até a confirmação; `parcelaNum`
   * só presente para `kind === 'parcela'`. Estado cliente puro — nada é persistido na grid.
   */
  abastecimentoId?: string
  abastecimentoKind?: 'avista' | 'parcela'
  parcelaNum?: number
}

/** "dd/MM" from a yyyy-MM-dd civil date (no tz ambiguity). */
function ddMM(occurredOn: string): string {
  const [, m, d] = occurredOn.split('-')
  return `${d}/${m}`
}

/**
 * G-08: the confirm-success toast message (presentation-only — confirmImport's persist
 * logic is untouched). Pure + exported so the three outcomes are pinned without
 * rendering the whole grid:
 *  - all-duplicate re-confirm (imported 0, duplicated >0) → the calm "já estavam" copy
 *    matching the page's all-duplicate empty state (NOT the failure-looking "0 importadas")
 *  - partial import (imported >0, duplicated >0) → count + "(N já existiam)"
 *  - clean import (duplicated 0) → the plain "{n} transação(ões) importada(s)"
 */
export function confirmToastMessage(imported: number, duplicated: number): string {
  if (imported === 0 && duplicated > 0) {
    return `Todas as ${duplicated} transações já estavam no extrato`
  }
  const base = `${imported} ${imported === 1 ? 'transação importada' : 'transações importadas'}`
  return duplicated > 0 ? `${base} (${duplicated} já existiam)` : base
}

/**
 * UX-02 (D-04/D-05): the PURE client-side re-classify run after an inline keyword is
 * persisted (Plan 02). Given the rows in state, the new keyword's category, and the
 * ALREADY-normalized keyword (never re-normalized here — re-deriving would re-strip the
 * glob `*`), apply the keyword to every row the user has NOT hand-classified:
 *   - target = `category_id === null` (unclassified / IA-não-aplicada) OR
 *     `origin ∈ {'memória', 'palavra-chave'}` (deterministic, owned origins);
 *   - a `origin === 'manual'` row is returned UNTOUCHED (same reference) before any
 *     match — explicit user intent is never overridden (SC5/T-25-06);
 *   - a matched target becomes `{ ..., category_id, origin: 'palavra-chave' }` (mirrors
 *     the upload pipeline's provenance) and gains NO `confidence`; its `suggestion`
 *     (if any) is left intact.
 * A degenerate keyword (`''`, `'*'`, `'**'`) compiles to null → the whole call is a no-op
 * (defense-in-depth alongside the Plan 01 cadastro reject; T-25-05). Pure + exported,
 * returns a NEW array; rows that do not change keep their referential identity so React
 * skips re-rendering them.
 */
export function reclassifyRowsWithKeyword(
  rows: ReviewRow[],
  categoryId: string,
  normalizedKeyword: string,
): ReviewRow[] {
  const rule = compileRule(categoryId, normalizedKeyword, 0)
  if (rule === null) return rows // degenerate keyword → no-op
  return rows.map((r) => {
    if (r.origin === 'manual') return r // never override hand-classified intent (SC5)
    const isTarget =
      r.category_id === null ||
      r.origin === 'memória' ||
      r.origin === 'palavra-chave'
    if (!isTarget) return r
    if (matchKeyword(r.descriptor_norm, [rule]) === null) return r
    return { ...r, category_id: categoryId, origin: 'palavra-chave' as const }
  })
}

/**
 * CAR-10/D-06/FUEL-01: aplica um vínculo de abastecimento CONFIRMADO a uma linha, em
 * estado cliente puro (sem auto-commit). Espelha `tagCarroRow` (seta `carro_id`) + o
 * apply-on-confirm da categoria. Dado uma linha com `abastecimentoMatch` pendente:
 *   - seta `carro_id = abastecimentoMatch.carroId` (etiqueta o carro, igual a `tagCarroRow`);
 *   - guarda a ESCOLHA do vínculo (`abastecimentoId`/`abastecimentoKind`/`parcelaNum`) para o
 *     payload do `runConfirm` → `confirmImport` (Plano 03) gravar;
 *   - aplica a categoria "Combustível" (`origin: 'manual'`, `reserva_id: null`) SOBRESCREVENDO
 *     a sugestão da IA/memória/palavra-chave (D-06: o vínculo é ação explícita forte). Se o id
 *     de "Combustível" não veio (conta antiga sem backfill), `combustivelCategoryId` é null →
 *     vincula o carro mas deixa a categoria como está (degrada limpo, FUEL-01).
 * O `abastecimentoMatch` é MANTIDO na linha após confirmar (a célula usa sua presença +
 * `abastecimentoId` para renderizar o estado "vinculado"); `discardLinkRow` é quem o limpa.
 * Pura: retorna a MESMA referência quando não há match pendente (React pula o re-render).
 */
export function applyLinkToRow(
  row: ReviewRow,
  combustivelCategoryId: string | null,
): ReviewRow {
  const match = row.abastecimentoMatch
  if (!match) return row // nada a vincular
  return {
    ...row,
    carro_id: match.carroId,
    abastecimentoId: match.abastecimentoId,
    abastecimentoKind: match.kind,
    parcelaNum: match.parcelaNum,
    // D-06/FUEL-01: pré-preenche "Combustível" sobrescrevendo IA/memória/keyword; degrada
    // limpo (mantém a categoria atual) quando o id da categoria não está disponível.
    ...(combustivelCategoryId !== null
      ? {
          category_id: combustivelCategoryId,
          reserva_id: null,
          origin: 'manual' as const,
        }
      : {}),
  }
}

/**
 * ImportReviewTable (UI-SPEC §3) — the core pre-persist review grid. A SIBLING of
 * ExtratoTable: @tanstack/react-table, getRowId by the parsed row's stable key, the
 * SAME checkbox/select model, the SAME inline CategoryBadge Select cell, and the SAME
 * focused "Qual reserva?" dialog (ReservaPicker) when a row is classified into the
 * Reserva category. Operates on UN-PERSISTED rows held in client state — NOTHING is
 * written to transactions until "Confirmar importação".
 *
 * Memory-miss (unclassified) rows get a `border-l-2 border-l-consumption` accent +
 * an amber "Não classificada" OriginBadge so they are scannable in a dense grid;
 * classifying drops the accent and flips Origem to `manual`. Bulk-classify reuses the
 * SelectionActionBar verbatim (label "Classificar", Reserva excluded — same rule as
 * Extrato). On confirm, confirmImport persists + learns; on success a toast + route
 * to /extrato. K>0 raises a non-blocking "Importar sem classificar?" guard.
 */
export function ImportReviewTable({
  statementId,
  initialRows,
  serverSummary,
  categories,
  reservas = [],
  carros = [],
  combustivelCategoryId = null,
}: {
  statementId: string
  initialRows: ReviewRow[]
  /**
   * The server-persisted N/M/K/J/descartadas summary (from `statements.summary`).
   * `duplicadas` + `descartadas` are read from HERE — never from the
   * `initialRows.length - rows.length` delta — so deleting a grid row does NOT
   * mis-count as a duplicate/descartada (RESEARCH Open Question 4 bug-fix).
   */
  serverSummary: ImportSummary
  categories: ReviewCategory[]
  reservas?: ReservaOption[]
  carros?: CarroOption[]
  /**
   * FUEL-01: o id da categoria "Combustível" do usuário, resolvido no RSC (page.tsx) e
   * consumido pelo apply-on-confirm do vínculo (`confirmLinkRow`/"Vincular todos"). null
   * quando a conta não tem a categoria (sem backfill) → a grid vincula o carro mas não
   * pré-preenche a categoria (degrada limpo).
   */
  combustivelCategoryId?: string | null
}) {
  const router = useRouter()
  const [rows, setRows] = React.useState<ReviewRow[]>(initialRows)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  // CLSAI-08: when the upload carries AI suggestions, the INITIAL order is driven by
  // the data array (lowConfidenceFirst below) — so start with NO column sort imposed,
  // leaving the low-confidence lead intact; the user can still click a header to sort
  // (onSortingChange stays wired). With no suggestions, keep the v1.3 default (date desc)
  // so the grid is byte-identical.
  const hasAiSuggestions = React.useMemo(
    () => initialRows.some((r) => r.suggestion?.categoryId != null),
    [initialRows],
  )
  const [sorting, setSorting] = React.useState<SortingState>(
    hasAiSuggestions ? [] : [{ id: 'occurred_on', desc: true }],
  )
  const [onlyUnclassified, setOnlyUnclassified] = React.useState(false)
  const [isConfirming, setIsConfirming] = React.useState(false)
  const [guardOpen, setGuardOpen] = React.useState(false)
  // KW-07: per-row "criada ✓" session state. A row whose id is in this Set has had a
  // keyword created (or found duplicate) inline this session → its "+ palavra-chave"
  // affordance flips to a disabled "criada ✓". Intentionally NOT persisted (UI-SPEC:
  // need not survive reload). Immutable updates so React re-renders.
  const [createdKeywordRows, setCreatedKeywordRows] = React.useState<Set<string>>(
    () => new Set(),
  )
  const markKeywordCreated = React.useCallback((rowId: string) => {
    setCreatedKeywordRows((prev) => {
      const next = new Set(prev)
      next.add(rowId)
      return next
    })
  }, [])

  /**
   * UX-02 lift-state: after an inline keyword is persisted (ok OR duplicate), re-classify
   * the OTHER rows in client state via the pure `reclassifyRowsWithKeyword` — no refetch /
   * remount, so scroll + selection survive (SC4). DISTINCT from `markKeywordCreated`
   * (which only flips the "criada ✓" affordance). The immutable map keeps untouched rows
   * by reference; `origin === 'manual'` rows are never touched (SC5).
   */
  const reclassifyWithKeyword = React.useCallback(
    (categoryId: string, normalizedKeyword: string) => {
      setRows((prev) =>
        reclassifyRowsWithKeyword(prev, categoryId, normalizedKeyword),
      )
    },
    [],
  )

  // The Reserva category is NOT a valid bulk target (the bulk path can't collect a
  // per-row reservaId for the aporte) — drop it from the picker, same rule as Extrato.
  const selectCategories: SelectionCategory[] = React.useMemo(
    () =>
      categories
        .filter((c) => !c.isReserva)
        .map((c) => ({ id: c.id, name: c.name })),
    [categories],
  )

  /** Classify a row in client state (inline pick or bulk). Flips origem + accent. */
  const classifyRow = React.useCallback(
    (id: string, categoryId: string, reservaId: string | null) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                category_id: categoryId,
                reserva_id: reservaId,
                origin: 'manual',
              }
            : r,
        ),
      )
    },
    [],
  )

  /**
   * CLSAI-10: apply every CONFIDENT (`confidence >= LOW_CONFIDENCE`) unapplied AI
   * suggestion in one click. For each still-unclassified (`category_id === null`) row
   * whose suggestion is at/above the threshold (isConfidentPending), fill the category
   * in CLIENT state only — identical non-binding fill to the per-row "Aplicar sugestão"
   * chip (origin → 'manual', reserva_id null), NEVER a DB write. Low-confidence
   * (`< 0.6`) rows are left UNTOUCHED → they stay pending + uncategorized for per-row
   * manual review. confirmImport stays the sole transactions/merchant_patterns path
   * (no auto-commit). A memory/keyword hit is never overwritten (the `category_id ===
   * null` gate inside isConfidentPending).
   */
  const applyAllSuggestions = React.useCallback(() => {
    // Keep the reducer PURE: derive the applied count outside it and fire the
    // toast once after the state update. A state updater may be invoked more
    // than once (e.g. StrictMode double-invocation), which — with the toast
    // inside — would emit a duplicate toast. The count read from `rows` matches
    // the reducer because both use the same isConfidentPending predicate over
    // the same committed state at click time.
    setRows((prev) =>
      prev.map((r) => {
        if (isConfidentPending(r)) {
          // isConfidentPending guarantees a non-null suggestion.categoryId, but the
          // boolean helper does not narrow r.suggestion for TS strict — assert it.
          return {
            ...r,
            category_id: r.suggestion!.categoryId,
            reserva_id: null,
            origin: 'manual' as const,
          }
        }
        return r
      }),
    )
    const applied = rows.filter(isConfidentPending).length
    if (applied > 0) {
      toast(
        `${applied} ${applied === 1 ? 'sugestão confiável aplicada' : 'sugestões confiáveis aplicadas'}`,
      )
    }
  }, [rows])

  /** Tag a row to a carro (or "Nenhum") in client state — sets carro_id ONLY, no
   *  other field (D4 additive). Mirrors classifyRow but orthogonal to category. */
  const tagCarroRow = React.useCallback((id: string, carroId: string | null) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, carro_id: carroId } : r)),
    )
  }, [])

  /**
   * CAR-10/D-06/FUEL-01: confirma o vínculo de abastecimento sugerido de UMA linha, em
   * estado cliente puro (sem auto-commit — nenhum confirmImport/supabase/revalidatePath
   * aqui, só setRows). Aplica `applyLinkToRow`: seta `carro_id` + a escolha do vínculo +
   * "Combustível" (sobrescreve IA/memória/keyword). O `combustivelCategoryId` (prop do RSC)
   * fecha sobre o callback; null degrada limpo (carro vinculado, categoria intacta).
   */
  const confirmLinkRow = React.useCallback(
    (id: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? applyLinkToRow(r, combustivelCategoryId) : r,
        ),
      )
    },
    [combustivelCategoryId],
  )

  /**
   * CAR-10: descarta a sugestão de vínculo de UMA linha — limpa SÓ o `abastecimentoMatch`
   * (a célula Carro volta ao Select normal / estado anterior). Não toca carro_id/categoria,
   * que o usuário ainda pode setar manualmente. Estado cliente puro.
   */
  const discardLinkRow = React.useCallback((id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, abastecimentoMatch: undefined } : r,
      ),
    )
  }, [])

  /**
   * CAR-10/D-07: "Vincular todos" — aplica `applyLinkToRow` a TODAS as linhas com uma
   * sugestão de vínculo pendente, de uma vez (molde de `applyAllSuggestions`: reducer PURO +
   * toast-once). O match é 1:1 exato por valor (alta precisão, Plano 01), então o lote é
   * seguro (D-07). Uma linha sem `abastecimentoMatch` é retornada intacta por `applyLinkToRow`.
   * O count é derivado FORA do reducer + o toast dispara UMA vez após o update (um state
   * updater pode ser invocado >1× em StrictMode; o toast dentro emitiria duplicado).
   */
  const confirmAllLinks = React.useCallback(() => {
    setRows((prev) =>
      prev.map((r) => applyLinkToRow(r, combustivelCategoryId)),
    )
    const applied = rows.filter(isLinkPending).length
    if (applied > 0) {
      toast(
        `${applied} ${applied === 1 ? 'vínculo aplicado' : 'vínculos aplicados'}`,
      )
    }
  }, [rows, combustivelCategoryId])

  /**
   * Delete a spurious review row from CLIENT state (D-02). Mirrors tagCarroRow: a
   * setRows filter + a sonner undo toast (no AlertDialog modal — fast cleanup is the
   * central PDF mechanism; the undo toast is the safety net). NOTHING is persisted —
   * confirm only sends the surviving rows. The deleted row is neither a duplicate nor
   * a descartada, so the server-sourced counts (summary memo) are untouched. The
   * undo re-inserts the captured row verbatim.
   */
  const deleteRow = React.useCallback((id: string) => {
    setRows((prev) => {
      const removed = prev.find((r) => r.id === id)
      const next = prev.filter((r) => r.id !== id)
      if (removed) {
        toast('Linha removida', {
          action: {
            label: 'Desfazer',
            onClick: () => setRows((p) => [...p, removed]),
          },
        })
      }
      return next
    })
  }, [])

  const visibleRows = React.useMemo(() => {
    const filtered = onlyUnclassified
      ? rows.filter((r) => r.category_id === null)
      : rows
    // CLSAI-08: low-confidence AI rows lead on the initial data order (only when AI
    // suggestions exist). Stable partition — the rest keep their relative order, and a
    // user column-sort (via getSortedRowModel/onSortingChange) overrides this lead.
    // With no suggestions the comparator is not applied ⇒ v1.3-identical order.
    return hasAiSuggestions ? lowConfidenceFirst(filtered) : filtered
  }, [rows, onlyUnclassified, hasAiSuggestions])

  const summary: ImportSummary = React.useMemo(
    () => ({
      total: initialRows.length,
      // M (novas) is authoritative only after confirm; pre-confirm we surface the
      // current grid size as the candidate count (deleting a spurious row lowers it).
      novas: rows.length,
      naoClassificadas: rows.filter((r) => r.category_id === null).length,
      // BUG FIX (RESEARCH Open Question 4): duplicadas + descartadas read from the
      // SERVER-provided summary, NOT the initialRows.length - rows.length delta. A
      // user-deleted grid row is neither a duplicate nor a descartada, so these counts
      // stay STABLE across deletes (delete-row only shrinks `novas`/the confirm payload).
      duplicadas: serverSummary.duplicadas,
      descartadas: serverSummary.descartadas,
    }),
    [rows, initialRows.length, serverSummary.duplicadas, serverSummary.descartadas],
  )

  const columns = React.useMemo<ColumnDef<ReviewRow>[]>(
    () => [
      {
        id: 'select',
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={
              table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
            }
            onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
            aria-label="Selecionar todas"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Selecionar linha"
          />
        ),
      },
      {
        accessorKey: 'occurred_on',
        header: 'Data',
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {ddMM(row.original.occurred_on)}
          </span>
        ),
      },
      {
        accessorKey: 'descriptor_raw',
        header: 'Descritor',
        enableSorting: false,
        cell: ({ row }) => {
          const raw = row.original.descriptor_raw || '—'
          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="block max-w-[28ch] truncate text-sm">
                          {raw}
                        </span>
                      }
                    />
                    <TooltipContent>{raw}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {row.original.is_recurring ? <RecorrenteTag /> : null}
                {row.original.is_foreign ? (
                  <span className="text-xs text-muted-foreground">convertido</span>
                ) : null}
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {row.original.descriptor_norm}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: 'category_id',
        header: 'Categoria',
        enableSorting: false,
        cell: ({ row }) => (
          <InlineReviewCategoryCell
            row={row.original}
            categories={categories}
            reservas={reservas}
            onClassify={classifyRow}
            keywordCreated={createdKeywordRows.has(row.original.id)}
            onKeywordCreated={markKeywordCreated}
            onKeywordPersisted={reclassifyWithKeyword}
          />
        ),
      },
      {
        id: 'origin',
        header: 'Origem',
        enableSorting: false,
        cell: ({ row }) => (
          <OriginBadge
            variant={
              row.original.category_id === null
                ? 'não classificada'
                : row.original.origin
            }
          />
        ),
      },
      {
        id: 'carro',
        header: 'Carro',
        enableSorting: false,
        cell: ({ row }) => (
          <InlineReviewCarroCell
            row={row.original}
            carros={carros}
            onTag={tagCarroRow}
            onConfirmLink={confirmLinkRow}
            onDiscardLink={discardLinkRow}
          />
        ),
      },
      {
        accessorKey: 'amount_cents',
        header: () => <div className="text-right">Valor</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <AmountCell
              cents={row.original.amount_cents}
              // Estorno/credit renders the income-green money token (UI-SPEC §Color),
              // never red. row.original.kind is threaded from the persisted row by the
              // route's reviewRows.map() (Task 3); OFX/CSV rows default to 'expense'.
              kind={row.original.kind === 'credit' ? 'income' : 'expense'}
              signed={false}
            />
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remover linha"
              onClick={() => deleteRow(row.original.id)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ),
      },
    ],
    [
      categories,
      reservas,
      classifyRow,
      carros,
      tagCarroRow,
      confirmLinkRow,
      discardLinkRow,
      deleteRow,
      createdKeywordRows,
      markKeywordCreated,
      reclassifyWithKeyword,
    ],
  )

  const table = useReactTable({
    data: visibleRows,
    columns,
    state: { rowSelection, sorting },
    getRowId: (r) => r.id, // stable parsed-row key (dedupe_key/temp id)
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const selectedIds = Object.keys(rowSelection)

  async function applyBulk(categoryId: string) {
    const n = selectedIds.length
    for (const id of selectedIds) {
      // Bulk excludes Reserva (no per-row reservaId), so reserva_id is null here.
      classifyRow(id, categoryId, null)
    }
    toast.success(
      `${n} ${n === 1 ? 'transação classificada' : 'transações classificadas'}`,
    )
    return { ok: true } as const
  }

  function runConfirm() {
    setIsConfirming(true)
    const payload = rows.map((r) => ({
      id: r.id,
      dedupe_key: r.dedupe_key,
      occurred_on: r.occurred_on,
      amount: r.amount,
      descriptor_raw: r.descriptor_raw,
      descriptor_norm: r.descriptor_norm,
      categoryId: r.category_id,
      reservaId: r.reserva_id ?? undefined,
      carroId: r.carro_id ?? undefined,
      // CAR-10/D-08: a ESCOLHA do vínculo, só presente quando o usuário confirmou (o
      // applyLinkToRow setou abastecimentoId). O confirmImport (Plano 03) re-deriva posse do
      // abastecimentoId (IDOR, WR-01) E o kind de parcelas_total (28-06 WR-02), e grava o
      // vínculo após o insert da tx. IN-01: parcelaNum NÃO cruza mais o boundary — o servidor
      // recomputa server-side (era morto/trust-smell); fica client-only no ReviewRow.
      abastecimentoId: r.abastecimentoId ?? undefined,
      abastecimentoKind: r.abastecimentoKind ?? undefined,
    }))
    confirmImport(statementId, payload)
      .then((result) => {
        if ('error' in result) {
          toast.error(result.error)
          setIsConfirming(false)
          return
        }
        // G-08: presentation-only branch via the pinned pure helper (confirmImport
        // logic untouched). An all-duplicate re-confirm no longer reads as the
        // failure-looking "0 transações importadas".
        toast.success(confirmToastMessage(result.imported, result.duplicated))
        // WR-04: reset the in-flight flag BEFORE the soft navigation. router.push
        // is a client-side push; if it is slow/intercepted or the user navigates
        // back to this still-mounted tree, leaving isConfirming=true would leave
        // the confirm button permanently disabled ('Importando…') with no recovery
        // short of a full reload. The error/catch branches already reset it.
        setIsConfirming(false)
        router.push('/extrato')
      })
      .catch(() => {
        toast.error('Não foi possível importar as transações. Tente de novo.')
        setIsConfirming(false)
      })
  }

  function onConfirmClick() {
    const k = rows.filter((r) => r.category_id === null).length
    if (k > 0) {
      setGuardOpen(true)
      return
    }
    runConfirm()
  }

  const unclassifiedCount = rows.filter((r) => r.category_id === null).length
  // CLSAI-10: rows still unclassified that carry a CONFIDENT (>= LOW_CONFIDENCE)
  // unapplied AI suggestion — drives the bulk "Aplicar N sugestões confiáveis" button
  // (visibility + label). Low-confidence rows are excluded: they stay pending for
  // manual review, so the button hides once no confident suggestions remain.
  const confidentSuggestionCount = rows.filter(isConfidentPending).length
  // CAR-10/D-07: rows carrying an UNCONFIRMED reverse-link suggestion — drives the
  // "Vincular todos" button (visibility + label). Confirming/discarding leaves this
  // partition, so the button hides once no pending links remain.
  const pendingLinkCount = rows.filter(isLinkPending).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ImportSummaryHeader
          summary={summary}
          onFilterUnclassified={() => setOnlyUnclassified((v) => !v)}
        />
        <div className="flex items-center gap-2">
          {confidentSuggestionCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={applyAllSuggestions}
            >
              <Sparkles className="size-4" aria-hidden />
              Aplicar {confidentSuggestionCount}{' '}
              {confidentSuggestionCount === 1
                ? 'sugestão confiável'
                : 'sugestões confiáveis'}
            </Button>
          ) : null}
          {pendingLinkCount > 0 ? (
            <Button type="button" variant="outline" onClick={confirmAllLinks}>
              <Sparkles className="size-4" aria-hidden />
              Vincular {pendingLinkCount}{' '}
              {pendingLinkCount === 1 ? 'abastecimento' : 'abastecimentos'}
            </Button>
          ) : null}
          <Button type="button" onClick={onConfirmClick} disabled={isConfirming}>
            {isConfirming ? 'Importando…' : 'Confirmar importação'}
          </Button>
        </div>
      </div>

      {onlyUnclassified ? (
        <button
          type="button"
          onClick={() => setOnlyUnclassified(false)}
          className="w-fit text-xs text-muted-foreground hover:underline"
        >
          Mostrando apenas não classificadas — ver todas
        </button>
      ) : null}

      {/* Desktop (≥md): the dense review table — selection/accent/origem frozen. */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const canSort = header.column.getCanSort()
              return (
                <TableHead
                  key={header.id}
                  className={cn(
                    header.column.id === 'select' && 'w-10',
                    header.column.id === 'occurred_on' && 'w-16',
                    header.column.id === 'actions' && 'w-10',
                    canSort && 'cursor-pointer select-none',
                  )}
                  onClick={
                    canSort ? header.column.getToggleSortingHandler() : undefined
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                  {canSort
                    ? { asc: ' ↑', desc: ' ↓' }[
                        header.column.getIsSorted() as string
                      ] ?? null
                    : null}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? 'selected' : undefined}
              className={cn(
                row.original.category_id === null &&
                  'border-l-2 border-l-consumption',
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Mobile (<md): one card per parsed row — same cells, only the wrapper
          changes. Selection reuses the SAME row model so the floating
          SelectionActionBar keeps working; the memory-miss amber accent
          (border-l-consumption) + the OriginBadge are preserved on the card.
          No getRowId/column/action change (behavior frozen). */}
      <ul className="flex flex-col gap-2 md:hidden">
        {table.getRowModel().rows.map((row) => {
          const r = row.original
          const raw = r.descriptor_raw || '—'
          return (
            <li
              key={row.id}
              data-state={row.getIsSelected() ? 'selected' : undefined}
              className={cn(
                'flex flex-col gap-2 rounded-lg border border-border bg-card p-3 data-[state=selected]:bg-muted',
                r.category_id === null && 'border-l-2 border-l-consumption',
              )}
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={row.getIsSelected()}
                  onCheckedChange={(v) => row.toggleSelected(!!v)}
                  aria-label="Selecionar linha"
                  className="mt-0.5"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="block truncate text-sm">{raw}</span>
                    {r.is_recurring ? <RecorrenteTag /> : null}
                    {r.is_foreign ? (
                      <span className="text-xs text-muted-foreground">
                        convertido
                      </span>
                    ) : null}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.descriptor_norm}
                  </span>
                  <InlineReviewCategoryCell
                    row={r}
                    categories={categories}
                    reservas={reservas}
                    onClassify={classifyRow}
                    keywordCreated={createdKeywordRows.has(r.id)}
                    onKeywordCreated={markKeywordCreated}
                    onKeywordPersisted={reclassifyWithKeyword}
                  />
                  <InlineReviewCarroCell
                    row={r}
                    carros={carros}
                    onTag={tagCarroRow}
                    onConfirmLink={confirmLinkRow}
                    onDiscardLink={discardLinkRow}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pl-7">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {ddMM(r.occurred_on)}
                  </span>
                  <OriginBadge
                    variant={r.category_id === null ? 'não classificada' : r.origin}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <AmountCell
                    cents={r.amount_cents}
                    kind={r.kind === 'credit' ? 'income' : 'expense'}
                    signed={false}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover linha"
                    onClick={() => deleteRow(r.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <SelectionActionBar
        selectedIds={selectedIds}
        categories={selectCategories}
        onApply={applyBulk}
        onClear={() => setRowSelection({})}
      />

      <AlertDialog open={guardOpen} onOpenChange={setGuardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar sem classificar?</AlertDialogTitle>
            <AlertDialogDescription>
              Há {unclassifiedCount} transações não classificadas. Elas serão
              importadas sem categoria e você pode classificá-las depois no extrato.
              Confirmar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setGuardOpen(false)
                runConfirm()
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * The inline Categoria editor — mirrors ExtratoTable's InlineCategoryCell but mutates
 * CLIENT state (nothing persisted until confirm). Choosing the Reserva category opens
 * the focused "Qual reserva?" dialog; on confirm the row is flagged as an aporte (the
 * ledger entry is created at Confirmar, not here). When empty, shows the inert
 * SuggestionSlot + an amber "Classificar" affordance.
 */
function InlineReviewCategoryCell({
  row,
  categories,
  reservas,
  onClassify,
  keywordCreated,
  onKeywordCreated,
  onKeywordPersisted,
}: {
  row: ReviewRow
  categories: ReviewCategory[]
  reservas: ReservaOption[]
  onClassify: (id: string, categoryId: string, reservaId: string | null) => void
  /** KW-07: true once a keyword was created (or found duplicate) for this row this
   *  session → the inline control shows "criada ✓" instead of the create pill. */
  keywordCreated: boolean
  /** KW-07: flips this row to "criada ✓" after a successful create/duplicate. */
  onKeywordCreated: (rowId: string) => void
  /** UX-02: re-classify the other rows in state after an inline keyword persists
   *  (ok/duplicate). Distinct from onKeywordCreated. */
  onKeywordPersisted: (categoryId: string, normalizedKeyword: string) => void
}) {
  const current = categories.find((c) => c.id === row.category_id)
  const [pendingCategoryId, setPendingCategoryId] = React.useState<string | null>(
    null,
  )
  const [reservaId, setReservaId] = React.useState('')
  const [reservaError, setReservaError] = React.useState<string | undefined>()

  function onChange(next: string) {
    if (!next || next === row.category_id) return
    const target = categories.find((c) => c.id === next)
    if (target?.isReserva) {
      setPendingCategoryId(next)
      setReservaId('')
      setReservaError(undefined)
      return
    }
    onClassify(row.id, next, null)
  }

  function confirmReserva() {
    if (!reservaId) {
      setReservaError('Selecione uma reserva.')
      return
    }
    if (pendingCategoryId) {
      onClassify(row.id, pendingCategoryId, reservaId)
      setPendingCategoryId(null)
    }
  }

  // CLSAI-07: resolve the suggestion's categoryId → name from the user's own categories
  // (already RLS-scoped, already in the grid — no new fetch). A null categoryId
  // ("nenhuma encaixa") yields null so the slot stays inert ("—"), exactly as v1.3.
  const suggestedCategoryId = row.suggestion?.categoryId ?? null
  const suggestionForSlot = suggestedCategoryId
    ? {
        categoryId: suggestedCategoryId,
        name:
          categories.find((c) => c.id === suggestedCategoryId)?.name ??
          suggestedCategoryId,
      }
    : null

  return (
    <div className="flex flex-col gap-1">
      <Select value={row.category_id ?? null} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger
          size="sm"
          className="border-transparent bg-transparent hover:border-input"
          aria-label="Classificar"
        >
          <SelectValue
            placeholder={
              <span className="text-consumption">Classificar</span>
            }
          >
            {current ? (
              <CategoryBadge name={current.name} color={current.color} />
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <CategoryBadge name={c.name} color={c.color} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Provenance + confidence sit on the chip's reserved row, one wrap-friendly
          line so a long category name + tag never force a column-width change. The
          chip itself only renders on the unclassified branch (memória rows keep no
          chip). Bridge + apply (onClassify) write nothing — confirmImport stays the
          sole merchant_patterns write. */}
      <div className="flex flex-wrap items-center gap-1">
        <ProvenanceBadge row={row} />
        {row.category_id === null ? (
          <SuggestionSlot
            suggestion={suggestionForSlot}
            onApply={(catId) => onClassify(row.id, catId, null)}
          />
        ) : null}
        <ConfidenceTag row={row} />
        {/* KW-07: opt-in "+ palavra-chave" inline control — ONLY on a row the user
            classified by hand (origin === 'manual'). Persists via addKeywordInline
            (no revalidatePath → no scroll jump, UX-01), no confirmImport. The gate is
            strictly 'manual' (the origin union has NO 'IA' member). */}
        {row.origin === 'manual' && row.category_id !== null ? (
          <KeywordInlineSuggest
            row={row}
            categoryName={current?.name ?? ''}
            created={keywordCreated}
            onCreated={onKeywordCreated}
            onPersisted={onKeywordPersisted}
          />
        ) : null}
      </div>

      <Dialog
        open={pendingCategoryId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingCategoryId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Qual reserva?</DialogTitle>
            <DialogDescription>
              Classificar como Reserva registra este lançamento como aporte.
            </DialogDescription>
          </DialogHeader>
          <ReservaPicker
            id="import-reserva"
            reservas={reservas}
            value={reservaId}
            onChange={(v) => {
              setReservaId(v)
              setReservaError(undefined)
            }}
            error={reservaError}
          />
          <DialogFooter className="mt-6">
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              }
            />
            <Button type="button" onClick={confirmReserva}>
              Confirmar aporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * KW-07: the opt-in inline "+ palavra-chave" control rendered on a `manual` review
 * row's chip line. A discreet neutral pill opens a small popover prefilled with the
 * row's normalized `descriptor_norm` (editable); Salvar persists via `addKeywordInline`
 * (UX-01: same guards/RLS as `addKeyword` but WITHOUT `revalidatePath`, so the page does
 * not scroll-jump) — no new server surface beyond Plan 01, no `confirmImport`, no
 * `transactions`/`merchant_patterns` write. On success OR duplicate the control flips to a
 * disabled "criada ✓" for the rest of the session (the keyword now exists either way) AND
 * the parent re-classifies the matching rows live (UX-02); a server error keeps the
 * popover open with a `FieldError`.
 *
 * `addKeywordInline` already validates (idSchema uuid + keywordSchema) and normalizes via
 * `normalizeKeyword`, so the popover sends the user's edited term verbatim and only
 * echoes `normalizeKeyword(term)` in the toast (mirrors category-keywords-dialog.tsx)
 * — it never re-normalizes a render value.
 */
function KeywordInlineSuggest({
  row,
  categoryName,
  created,
  onCreated,
  onPersisted,
}: {
  row: ReviewRow
  categoryName: string
  created: boolean
  onCreated: (rowId: string) => void
  /** UX-02: fired ONLY on the success path (ok/duplicate) with the row's category +
   *  the already-normalized keyword, so the parent re-classifies the other rows. */
  onPersisted: (categoryId: string, normalizedKeyword: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  // descriptor_norm is row-stable (immutable for a parsed review row), so this
  // lazy seed never needs to re-sync from props.
  const [value, setValue] = React.useState(row.descriptor_norm)
  const [error, setError] = React.useState<string | undefined>()
  const [isPending, startTransition] = React.useTransition()
  const inputId = React.useId()

  // Once created/duplicate, the control is a disabled "criada ✓" — never a button.
  if (created) {
    return (
      <span
        className="inline-flex min-h-5 w-fit items-center gap-1 rounded-4xl bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        aria-label="Palavra-chave criada"
      >
        <Check className="size-3 shrink-0" aria-hidden />
        criada ✓
      </span>
    )
  }

  function onSubmit() {
    const normalized = normalizeKeyword(value.trim())
    setError(undefined)
    startTransition(async () => {
      // UX-01: addKeywordInline persists WITHOUT revalidatePath → no scroll jump.
      const r = await addKeywordInline(row.category_id!, value)
      if ('error' in r) {
        // Keep the popover open + show the FieldError; do NOT flip to "criada ✓".
        setError(r.error)
        return
      }
      if ('duplicate' in r) {
        toast.info(`"${normalized}" já está cadastrada.`)
      } else {
        toast.success(`"${normalized}" adicionada a ${categoryName}.`)
      }
      // Both { ok } and { duplicate } flip to "criada ✓" — the keyword now exists.
      onCreated(row.id)
      // UX-02: re-classify the other rows live (ok OR duplicate — the keyword exists
      // either way, so the grid aligns; NEVER on the error branch above). Uses the
      // already-computed normalized term (never re-normalize a render value).
      onPersisted(row.category_id!, normalized)
      setOpen(false)
    })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setError(undefined)
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Criar palavra-chave para esta categoria"
            className="inline-flex min-h-5 w-fit items-center gap-1 rounded-4xl bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80"
          >
            <Tags className="size-3 shrink-0" aria-hidden />+ palavra-chave
          </button>
        }
      />
      <PopoverContent className="w-72">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={inputId}>Palavra-chave</FieldLabel>
            <Input
              id={inputId}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(undefined)
              }}
              aria-invalid={!!error}
              maxLength={60}
              autoFocus
            />
            {categoryName ? (
              <p className="text-sm text-muted-foreground">
                Será usada para classificar futuras faturas em {categoryName}.
              </p>
            ) : null}
            <FieldError errors={error ? [{ message: error }] : undefined} />
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(undefined)
                  setOpen(false)
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </Field>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The inline per-row "Carro" editor (CAR-02) — a small Select tagging the row to a
 * carro BEFORE persist. LOCAL to this file (no carro-picker.tsx import — Plan 02
 * builds that in parallel). A leading "Nenhum" item maps to the empty/untagged value;
 * choosing it clears the tag. Reuses the SAME shadcn Select primitives + Phase-7
 * grammar already imported here — no new primitive. Orthogonal to category (D4): it
 * touches carro_id only and never affects origem/accent/valor/metas.
 */
function InlineReviewCarroCell({
  row,
  carros,
  onTag,
  onConfirmLink,
  onDiscardLink,
}: {
  row: ReviewRow
  carros: CarroOption[]
  onTag: (id: string, carroId: string | null) => void
  /** CAR-10/D-06: confirm the reverse-link suggestion (sets carro_id + "Combustível" + the
   *  link choice in client state). Optional/back-compat for any caller without the link wiring. */
  onConfirmLink?: (id: string) => void
  /** CAR-10: discard the reverse-link suggestion (clears only abastecimentoMatch). */
  onDiscardLink?: (id: string) => void
}) {
  // CAR-10/D-05: when an UNCONFIRMED reverse-link suggestion exists, the Carro cell becomes
  // the anchor for the link affordance (no 3rd column) — a SuggestionSlot-style chip
  // "Vincular a {apelido}" (sparkles, primary-tinted, min-h to avoid reflow) + a discard
  // action. Confirm sets carro_id + the link + "Combustível" (applyLinkToRow); discard
  // clears the suggestion → the cell falls back to the normal Select below. After confirm,
  // abastecimentoId is set so this branch no longer fires and the Select shows the tagged carro.
  const pendingLink =
    row.abastecimentoMatch && row.abastecimentoId === undefined
      ? row.abastecimentoMatch
      : null
  if (pendingLink) {
    return (
      <span className="inline-flex min-h-5 items-center gap-1">
        <button
          type="button"
          onClick={() => onConfirmLink?.(row.id)}
          className="inline-flex min-h-5 w-fit items-center gap-1 rounded-4xl bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
        >
          <Sparkles className="size-3 shrink-0" aria-hidden />
          Vincular a {pendingLink.carroApelido}
        </button>
        <button
          type="button"
          onClick={() => onDiscardLink?.(row.id)}
          aria-label="Descartar vínculo sugerido"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </span>
    )
  }

  function onChange(next: string) {
    onTag(row.id, next === NENHUM_CARRO ? null : next)
  }

  return (
    <Select
      // G-07: pass the value→label `items` map so Base UI's collapsed trigger renders
      // the LABEL ("Nenhum"/apelido), not the raw sentinel/uuid (same proven 12-08 G-01
      // fix as CarroPicker). Without this, an untagged row showed the literal `__none__`.
      items={
        {
          [NENHUM_CARRO]: 'Nenhum',
          ...Object.fromEntries(carros.map((c) => [c.id, c.apelido])),
        } as Record<string, string>
      }
      value={row.carro_id ?? NENHUM_CARRO}
      onValueChange={(v) => onChange(v ?? NENHUM_CARRO)}
    >
      <SelectTrigger
        size="sm"
        className="border-transparent bg-transparent hover:border-input"
        aria-label="Vincular a carro"
      >
        <SelectValue placeholder={<span className="text-muted-foreground">Nenhum</span>} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NENHUM_CARRO}>
          <span className="text-muted-foreground">Nenhum</span>
        </SelectItem>
        {carros.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.apelido}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
