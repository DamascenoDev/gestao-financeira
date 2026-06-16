---
phase: 02-receitas-categorias-e-lan-amentos-manuais
verified: 2026-06-16T16:05:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
mode: mvp
re_verification:
  previous_status: none
  note: initial verification
deferred:
  - truth: "Browser-interaction confirmation of INC-02 edit-choice (só este mês vs template) in a live UI"
    addressed_in: "02-05 (human-verify walkthrough — deferred to user per milestone-wide defer-browser decision)"
    evidence: "Underlying logic covered by tests/income-occurrence.test.ts (occurrence-edit isolation) + src/actions/incomes.test.ts updateOccurrence-only assertions"
  - truth: "Browser-interaction confirmation of Extrato month/category filter URL round-trip (TXN-03)"
    addressed_in: "02-05 (human-verify walkthrough — deferred to user)"
    evidence: "RSC reads ?mes/?cat and re-derives data + totals from v_category_totals; CategoryFilter writes ?cat via router.replace preserving ?mes (src/components/category-filter.tsx)"
  - truth: "Browser-interaction confirmation of bulk re-classify selection → apply → toast (TXN-04)"
    addressed_in: "02-05 (human-verify walkthrough — deferred to user)"
    evidence: "tests/bulk-reclassify.test.ts (single .in() update, forged-id RLS scoping) + src/actions/transactions.test.ts bulk assertions; wired in src/components/extrato-table.tsx"
human_verification:
  - test: "Extrato filters round-trip — change month (?mes) + multi-select categories"
    expected: "Transaction list, per-category totals footer, and the URL all update to reflect the filter"
    why_human: "Browser-only interaction (router.replace + RSC re-render); logic is automated-tested but the visual/URL round-trip is not driven headlessly. Deferred per milestone-wide defer-browser-verification user decision."
  - test: "Bulk re-classify — select several Extrato rows → SelectionActionBar → apply a category"
    expected: "All selected rows move to the chosen category; success toast '{n} transações reclassificadas' fires"
    why_human: "UI row-selection interaction. bulkReclassify single-update + RLS scoping are automated-tested; the click-through is deferred to the user."
  - test: "INC-02 edit-choice — edit a recurring occurrence, pick 'Alterar só em {mês}'"
    expected: "Only that month's value changes; the template and other months stay intact"
    why_human: "Two-button dialog choice in the browser. Occurrence-edit isolation is automated-tested (income-occurrence.test.ts); the dialog click-through is deferred to the user."
---

# Phase 2: Receitas, categorias e lançamentos manuais — Verification Report

**Phase Goal:** Usuário registra de onde vem o dinheiro e para onde vai, à mão — receitas (recorrentes + avulsas), categorias editáveis e transações com extrato — provando o loop de dados antes de qualquer upload.
**Verified:** 2026-06-16T16:05:00Z
**Status:** passed (local must-haves met; browser walkthrough deferred to user)
**Re-verification:** No — initial verification
**Mode:** mvp

## Goal Achievement

All five ROADMAP success criteria are observably true in the codebase against the LOCAL Supabase stack (http://127.0.0.1:55321, migrations 0001-0008 applied). Remote deploy is deferred for the whole milestone (user decision). The three browser-interaction confirmations from plan 02-05 are deferred to the user; their underlying logic is covered by the 117-test automated suite.

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Receita recorrente fixa + ajuste de um mês + avulsa + receita líquida do mês (INC-01/02/03/04) | ✓ VERIFIED | `createIncomeTemplate` (template + materialized occurrence), `updateOccurrence` touches ONLY `income_occurrences` (INC-02), `createAdhocIncome` inserts `template_id:null` (INC-03), `v_income_month` sums via SQL → líquida hero in `receitas/page.tsx` (INC-04). Tests: income-occurrence (isolation), income-adhoc (NULL-distinct multiple avulsas), income-month (SUM) all GREEN. |
| 2 | Cria/renomeia/remove categorias + marca consumo/alocação (CAT-02/03) | ✓ VERIFIED | `categories.ts`: createCategory/renameCategory/setKind/setColor/archiveCategory; `deleteCategory` pre-checks tx_count → `{blocked}` when >0; `reassignAndDelete` atomic RPC; FK `ON DELETE RESTRICT` 23503 backstop. CAT-03 kind toggle via `setKind` + `CategoryKindToggle`. Tests category-delete + category-kind GREEN; 19 action tests. |
| 3 | Lança/edita/exclui transação manual (TXN-01/02) | ✓ VERIFIED | `transactions.ts`: createTransaction (positive `amount_cents`, `kind:'expense'`), updateTransaction, deleteTransaction; `amount_cents > 0` DB check; RLS owner-scoped. Tests transactions-rls (four-verb two-user isolation) GREEN; 14 action tests. |
| 4 | Extrato filtrável por mês e categoria (TXN-03) | ✓ VERIFIED | `extrato/page.tsx` reads `?mes`/`?cat`, queries month transactions with optional `.in('category_id', cat)`, per-category + grand totals from `v_category_totals`; `CategoryFilter` writes `?cat` preserving `?mes`; dense TanStack table with totals footer. (Browser round-trip deferred — see human_verification.) |
| 5 | Reclassifica várias transações de uma vez (TXN-04) | ✓ VERIFIED | `bulkReclassify(ids, categoryId)` = single `update({category_id}).in('id', ids)`, RLS-scoped even for forged ids. Wired in `extrato-table.tsx` (`selectedIds = Object.keys(rowSelection)` → SelectionActionBar). Test bulk-reclassify (forged-id touches 0 rows) GREEN. |

**Score:** 5/5 truths verified

### Deferred Items

Browser-interaction confirmations explicitly deferred to the user (milestone-wide defer-browser decision); logic is automated-tested.

| # | Item | Addressed In | Evidence |
| --- | --- | --- | --- |
| 1 | INC-02 edit-choice dialog round-trip | 02-05 walkthrough (user) | income-occurrence.test.ts + updateOccurrence assertions |
| 2 | Extrato filter URL round-trip | 02-05 walkthrough (user) | category-filter.tsx + RSC re-derivation |
| 3 | Bulk re-classify UI selection round-trip | 02-05 walkthrough (user) | bulk-reclassify.test.ts + extrato-table wiring |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `supabase/migrations/0004_incomes.sql` | income tables + RLS + unique | ✓ VERIFIED | RLS USING+WITH CHECK, grants, indexes, `unique(user_id,template_id,month_key)`, `amount_cents >= 0` |
| `supabase/migrations/0005_transactions.sql` | transactions + FK RESTRICT + positive | ✓ VERIFIED | `amount_cents > 0`, `category_id ... ON DELETE RESTRICT`, RLS + grants + 2 indexes |
| `supabase/migrations/0006_categories_color.sql` | additive color column | ✓ VERIFIED | `add column if not exists color text` |
| `supabase/migrations/0007_views.sql` | security_invoker aggregate views | ✓ VERIFIED | both `with (security_invoker = true)`; `v_income_month` SUM, `v_category_totals` SUM+count |
| `supabase/migrations/0008_reassign_and_delete.sql` | atomic reassign RPC | ✓ VERIFIED | `security invoker`, UPDATE-then-DELETE in one function, execute grant to authenticated |
| `src/actions/incomes.ts` | income actions | ✓ VERIFIED | substantive, Zod-validated, getClaims owner, parseBRLToCents |
| `src/actions/categories.ts` | category actions | ✓ VERIFIED | substantive; delete-block + archive + atomic reassign |
| `src/actions/transactions.ts` | transaction actions | ✓ VERIFIED | substantive; CRUD + single-statement bulkReclassify |
| `src/app/(app)/{receitas,categorias,extrato}/page.tsx` | RSC pages reading live data | ✓ VERIFIED | all three read real queries/views; build compiles all 3 routes |
| `src/types/database.types.ts` | regenerated typed client | ✓ VERIFIED | contains income_templates/occurrences, transactions, both views, RPC, color |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| extrato-table.tsx | bulkReclassify action | `import { bulkReclassify }` + onApply → SelectionActionBar | ✓ WIRED |
| extrato/page.tsx | v_category_totals | `.from('v_category_totals')` per-category + grand totals | ✓ WIRED |
| receitas/page.tsx | v_income_month | `.from('v_income_month').select('total_cents')` → hero | ✓ WIRED |
| categorias/page.tsx | reassignAndDelete RPC | category-delete-dialog → reassignAndDelete → `rpc('reassign_and_delete_category')` | ✓ WIRED |
| All money entry | money.ts | parseBRLToCents (entry) / formatCents (display) | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
| --- | --- | --- | --- | --- |
| receitas/page.tsx | totalCents / occurrences | `v_income_month` + `income_occurrences` queries | Yes (SQL) | ✓ FLOWING |
| categorias/page.tsx | categories + txCountByCategory | `categories` + `v_category_totals` queries | Yes (SQL) | ✓ FLOWING |
| extrato/page.tsx | transactions + categoryTotals | `transactions` + `v_category_totals` queries | Yes (SQL) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full test suite green | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` | 117 passed (17 files) | ✓ PASS |
| Type check clean | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Production build | `npm run build` | exit 0; /receitas, /categorias, /extrato compiled | ✓ PASS |
| Integration tests run against DB (not skipped) | `npx vitest run tests/rls-isolation.test.ts` | 20 passed | ✓ PASS |

> Note: A first `npx vitest run` reported 1 file failed / 20 skipped — caused by the bundled `supabase` CLI crashing on a `telemetry.json` rename race during `rls-isolation.test.ts` setup, NOT a product defect. Re-running the file (and the full suite) with `SUPABASE_DISABLE_TELEMETRY=1` yields a clean 117/117. Flaky infra, not a code gap.

### Probe Execution

No project probe scripts (`scripts/*/tests/probe-*.sh`) declared or present for this phase. N/A — validation contract is the vitest suite, which was executed (117/117).

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| --- | --- | --- | --- |
| INC-01 | 02-02 | ✓ SATISFIED | createIncomeTemplate + materialize |
| INC-02 | 02-02 | ✓ SATISFIED | updateOccurrence (occurrence-only) + income-occurrence test |
| INC-03 | 02-02 | ✓ SATISFIED | createAdhocIncome template_id:null + income-adhoc test |
| INC-04 | 02-01/02 | ✓ SATISFIED | v_income_month SUM → líquida hero |
| CAT-02 | 02-03 | ✓ SATISFIED | delete-block + archive + atomic reassign + FK RESTRICT |
| CAT-03 | 02-03 | ✓ SATISFIED | setKind toggle + category-kind test |
| TXN-01 | 02-04 | ✓ SATISFIED | createTransaction positive cents |
| TXN-02 | 02-04 | ✓ SATISFIED | update/deleteTransaction + transactions-rls test |
| TXN-03 | 02-04 | ✓ SATISFIED | ?mes/?cat filters + v_category_totals footer |
| TXN-04 | 02-04 | ✓ SATISFIED | bulkReclassify single .in() + bulk-reclassify test |

All 10 phase requirements satisfied. No orphaned requirements (REQUIREMENTS.md Phase 2 set == plan-declared set).

### Security Verification

| Check | Status | Evidence |
| --- | --- | --- |
| income_templates / income_occurrences / transactions RLS USING + WITH CHECK | ✓ | `for all to authenticated using ((select auth.uid()) = user_id) with check (...)` in 0004/0005 |
| DML grants to authenticated + user_id index on new tables | ✓ | grants + `*_user_id_idx` / `*_user_month_idx` in 0004/0005 |
| Aggregate views security_invoker (no leak) | ✓ | both views `with (security_invoker = true)`; view-leak.test.ts user B reads 0 rows of user A — GREEN |
| Server Actions Zod-validated | ✓ | every action safeParses a shared schema; rejects bad uuid/date/money/kind |
| Money via money.ts (bigint centavos, never float) | ✓ | parseBRLToCents on entry, formatCents on display; `amount_cents > 0` DB check |
| reassign RPC runs as caller (RLS-scoped) | ✓ | `security invoker` in 0008 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (multiple form components) | various | `placeholder="..."` | ℹ️ Info | Legitimate HTML input placeholder attributes — not stub markers |
| selection-action-bar.tsx | 50 | `if (n === 0) return null` | ℹ️ Info | Correct conditional render (hidden when nothing selected) — not an empty implementation |

No TBD/FIXME/XXX debt markers. No TODO/HACK. No hollow props (empty arrays are `?? []` fallbacks over real queries). No console-only handlers.

### Human Verification Required

Three browser-interaction confirmations are deferred to the user (consistent with the milestone-wide defer-browser-verification decision). The underlying logic of all three is covered by the automated suite; only the live click-through remains.

1. **Extrato filters round-trip** — change month + multi-select categories; confirm list + totals + URL update.
2. **Bulk re-classify** — select several rows → SelectionActionBar → apply category; confirm all updated + toast.
3. **INC-02 edit-choice** — edit a recurring occurrence; pick "Alterar só em {mês}"; confirm template + other months intact.

To run locally: `supabase start` (if stopped) → `npm run dev` → http://localhost:3000.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria and all 10 requirements are satisfied in the codebase at the LOCAL layer (DB migrations + RLS + security_invoker views + Zod-validated Server Actions + 117 automated tests + clean tsc + clean build). The only outstanding items are three browser-interaction confirmations whose logic is already automated-tested — explicitly deferred to the user per the milestone-wide defer-browser decision, recorded under deferred/human_verification rather than as failures.

---

_Verified: 2026-06-16T16:05:00Z_
_Verifier: Claude (gsd-verifier)_
