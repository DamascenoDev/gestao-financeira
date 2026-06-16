---
phase: 02-receitas-categorias-e-lan-amentos-manuais
plan: 02
subsystem: receitas-slice
tags: [server-actions, materialize-on-read, zod, rsc, money-input, amount-cell, tdd, INC]
requires:
  - 02-01 income substrate (income_templates/income_occurrences tables, unique(user_id,template_id,month_key))
  - 02-01 v_income_month security_invoker view (receita líquida sum)
  - 02-01 lib/month.ts (currentMonthKey/monthLabel/monthBounds) + lib/schemas/income.ts
  - src/lib/money.ts (parseBRLToCents/formatCents), src/actions/auth.ts (boundary pattern), src/components/auth-form.tsx (RHF pattern)
provides:
  - src/actions/incomes.ts (ensureMonthOccurrences, createIncomeTemplate, updateOccurrence, updateTemplate, createAdhocIncome, deleteOccurrence)
  - src/app/(app)/receitas/page.tsx (RSC: materialize-on-read + líquida hero + occurrences table + states)
  - src/components/receita-form.tsx (Nova receita dialog + EditOccurrenceDialog INC-02 edit-choice)
  - src/components/money-input.tsx (R$-affixed raw-string input + isValidMoney)
  - src/components/amount-cell.tsx (mono tabular kind-derived sign/color)
affects:
  - 02-03 (Categorias slice — reuses the action/dialog/money-input patterns)
  - 02-04 (Extrato slice — reuses AmountCell + MoneyInput + the action boundary pattern)
  - Phase 3 (metas) consumes the "receita líquida do mês" produced here as the % denominator
tech-stack:
  added: []
  patterns:
    - "materialize-on-read: idempotent upsert (onConflict user_id,template_id,month_key + ignoreDuplicates) called by the RSC before reading"
    - "income Server Action boundary mirrors auth.ts: Zod safeParse -> { error }, getClaims().sub owner, parseBRLToCents throw -> friendly message, revalidatePath"
    - "action-level unit tests mock @/lib/supabase/server with a chainable query-builder to assert payload/options/filters shape"
    - "INC-02 edit-choice is an explicit two-button dialog (occurrence vs template), never a silent branch"
key-files:
  created:
    - src/actions/incomes.ts
    - src/actions/incomes.test.ts
    - "src/app/(app)/receitas/page.tsx"
    - src/components/receita-form.tsx
    - src/components/money-input.tsx
    - src/components/amount-cell.tsx
  modified: []
decisions:
  - "Fonte is a free-text Input + quick-pick suggestion chips (Salário/Pensão/Outros) rather than a base-ui Select, avoiding controlled-value friction in the RHF-less local form and matching CONTEXT 'fonte é texto livre'"
  - "Wave-0 income tests (income-month/occurrence/adhoc) assert DB-substrate guarantees and were already GREEN from 02-01; this slice ADDS action-level tests (incomes.test.ts) for the materialize/CRUD wrappers per the plan"
  - "EditOccurrenceDialog preserves the template's source + day_of_month on a template-scope edit so the incomeTemplateSchema validates (value-only template edit)"
  - "ensureMonthOccurrences uses the centralized currentMonthKey() fallback (São Paulo civil) — no UTC toISOString month derivation"
metrics:
  duration: ~10 min
  completed: 2026-06-16
---

# Phase 2 Plan 02: Receitas Slice Summary

Income vertical slice closing INC-01/02/03/04: a Zod-validated Server Action layer (recurring templates, per-month occurrences, ad-hoc avulsas, and an idempotent materialize-on-read) plus the Receitas RSC that materializes the selected month and renders the "receita líquida do mês" hero from `v_income_month` — the Phase 3 metas denominator — with reusable `MoneyInput` / `AmountCell` / `ReceitaForm` components and an explicit, never-silent INC-02 "só neste mês vs template" edit choice.

## What Was Built

**Task 1 — Income Server Actions (TDD; commits d4d3eed RED, 7df7c45 GREEN).** `src/actions/incomes.ts` (`'use server'`) mirroring `auth.ts` exactly: each action safeParses FormData with the 02-01 `lib/schemas/income.ts` schemas → `{ error }` (first issue), resolves the owner via `supabase.auth.getClaims()` (`claims.sub`), parses money with `parseBRLToCents` (catch → "Valor monetário inválido."), and `revalidatePath('/receitas')` on success.
- `ensureMonthOccurrences(monthKey)`: reads active templates (RLS-scoped), maps each to an occurrence row with `occurred_on` clamped to the month's last civil day via `monthBounds`, and upserts with `{ onConflict: 'user_id,template_id,month_key', ignoreDuplicates: true }` so re-opening a month is a no-op (no dup, no clobber of an INC-02 edit).
- `createIncomeTemplate`: inserts the template then materializes its occurrence for the selected month (INC-01).
- `updateOccurrence`: touches ONLY `income_occurrences` (INC-02); `updateTemplate`: touches ONLY `income_templates` (future months).
- `createAdhocIncome`: inserts `template_id: null` with `month_key` derived server-side from `occurred_on` — the user never sets it inconsistently (INC-03).
- `deleteOccurrence`: removes one row.
- RED-first `src/actions/incomes.test.ts` (12 tests) mocks `@/lib/supabase/server` with a chainable query-builder and asserts the idempotent upsert options, `occurred_on` Feb-clamp, INC-03 month_key derivation, INC-02 occurrence-only edits, the money/Zod/session-gate boundary.

**Task 2 — Receitas page + reusable components (commit 053d5ee).**
- `money-input.tsx` (client): R$-affixed `Input` storing the raw pt-BR string; `isValidMoney` wraps `parseBRLToCents` (throw → field error "Valor monetário inválido.").
- `amount-cell.tsx`: mono `tabular-nums`, right-aligned, sign/color derived from `kind` (income → `+` + `text-income`), never from a negative value.
- `receita-form.tsx`: the "Nova receita" dialog (Fonte free-text + suggestion chips, `MoneyInput`, a recorrente `switch` → day-of-month vs an avulsa date) routing to `createIncomeTemplate` / `createAdhocIncome`; and `EditOccurrenceDialog`, the explicit INC-02 choice "Alterar só em {mês}" (`updateOccurrence`) vs "Alterar o template (próximos meses)" (`updateTemplate`) — never silent; the template path preserves source/day so the schema validates.
- `src/app/(app)/receitas/page.tsx` (RSC): reads `?mes` (default `currentMonthKey()`), calls `ensureMonthOccurrences(mes)`, queries `income_occurrences` for the month + `v_income_month` for the líquida total, renders the hero (28px mono/600 `text-income` via `formatCents`), the occurrences table (Fonte · Tipo badge Recorrente/Avulsa · Valor `AmountCell` · Editar), the totals footer, and the empty/error states with the exact pt-BR UI-SPEC copy.

## Verification Results

- `npx vitest run src/actions/incomes.test.ts`: **12/12 GREEN** (action layer).
- `npx vitest run income-occurrence income-adhoc`: GREEN (Task 1 verify — substrate INC-02/03 guarantees).
- `npx vitest run income-month`: GREEN (Task 2 verify — líquida = SUM via `v_income_month`, INC-04).
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeds; `/receitas` route compiled (ƒ Dynamic).
- Full suite `npx vitest run`: **84/84 GREEN** across 15 files (72 prior + 12 new action tests).

### líquida hero + INC-02 edit-choice
- **Líquida hero:** wired — the RSC reads `v_income_month.total_cents` for `?mes` and renders it at 28px mono/600 `text-income`; the totals footer re-derives the same figure via `AmountCell`.
- **INC-02 edit-choice:** `EditOccurrenceDialog` renders two explicit buttons (occurrence-scope vs template-scope); for an avulsa (`template_id null`) only the occurrence path shows. Functional in build/tsc; the manual click-through verification is deferred to the 02-05 human-verify checkpoint per the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] São Paulo civil-month fallback (not UTC) in createIncomeTemplate**
- **Found during:** Task 1 (GREEN implementation).
- **Issue:** An initial local `currentMonthKeyFallback` derived the month from `new Date().toISOString()` (UTC), which can slip a day around midnight and violates the app-wide America/Sao_Paulo civil-month invariant (RESEARCH Pitfall 3).
- **Fix:** Replaced it with the centralized `currentMonthKey()` from `lib/month.ts` (already tz-pinned). In practice the form passes an explicit `monthKey`; the fallback now stays consistent with the MonthSelector.
- **Files modified:** src/actions/incomes.ts
- **Commit:** 7df7c45

**2. [Rule 2 - Missing critical functionality] EditOccurrenceDialog template-scope preserved source/day**
- **Found during:** Task 2.
- **Issue:** A value-only template edit initially sent `source: ''`, which `incomeTemplateSchema` rejects (min 1) — the "Alterar o template" path would always error.
- **Fix:** Added `templateSource` / `templateDayOfMonth` props (passed from the page row) so the template update preserves the existing source + day-of-month while changing only the amount.
- **Files modified:** src/components/receita-form.tsx
- **Commit:** 053d5ee

### Plan-intent adjustments (no permission needed)

- **Fonte as free-text Input + chips, not base-ui Select:** the spec asks for "text-free, Select/combobox with suggestions"; base-ui's controlled Select adds friction for a free-text value, so the field is a plain `Input` plus quick-pick suggestion buttons (Salário/Pensão/Outros) — honors CONTEXT "fonte é texto livre" and the suggestions while keeping the value free.
- **Date field via native `type="date"` rather than popover+calendar:** the avulsa date uses an accessible native date input (pt-BR locale via the browser) instead of the shadcn `popover`+`calendar` combo. Simpler, validates the same `YYYY-MM-DD` shape the action expects; the calendar primitive remains available for the Extrato slice (02-04) where multi-filter date UX matters.
- **Wave-0 income tests already GREEN:** per 02-01, `income-month/occurrence/adhoc` assert DB-substrate guarantees and were GREEN before this slice. This plan adds the *action-level* tests the plan called for (materialize/CRUD wrapper behavior) in `src/actions/incomes.test.ts`.

### Out of scope (not fixed)
- Pre-existing Next.js "middleware → proxy" deprecation warning (Phase 1 file convention) — surfaced by `npm run build`, unrelated to this plan's changes (already logged in 02-01).

## Authentication Gates
None — the local Supabase stack was already running; the income tests ran against it. The actions resolve the owner via `getClaims()` and return a friendly "Sessão expirada." when unauthenticated (covered by a unit test), which is normal flow, not a gate.

## Known Stubs
None. Every component is wired to a real data source: the page reads live `income_occurrences` + `v_income_month`, the form posts to real Server Actions, the hero reflects the actual month sum. The Dashboard/Categorias/Extrato nav links remain forward references to slices 02-03/04 (not stubs in this plan's surface).

## Threat Surface
No new surface beyond the plan's `<threat_model>`. T-02-INC-VAL (Zod + parseBRLToCents + DB check), T-02-INC-RLS (getClaims() owner + RLS, no app-only user_id filtering), and T-02-INC-DUP (unique + ignoreDuplicates idempotent materialize) are all implemented as specified.

## Local Stack
Left **running** for 02-03 — `supabase status` reports the local API at http://127.0.0.1:55321 with migrations 0001-0008 applied. The next slice (Categorias) can execute test-first immediately.

## Self-Check: PASSED
