---
phase: 10-abastecimento-h-brido-consumo
verified: 2026-06-17T15:55:00Z
status: passed
score: 18/18 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
deferred:
  - truth: "v_abastecimento_consumo double-counts litros/custo when two tanque_cheio fills share the EXACT same odometro_km"
    addressed_in: "Phase 11"
    evidence: "10-REVIEW-FIX.md WR-02: deferred to Phase 11 by orchestrator triage (near-impossible same-odometer anomaly; the km_rodados<=0 guard already excludes the common case). A 0029 view refinement is Phase-11 scope (Phase 11 builds on these views)."
---

# Phase 10: Abastecimento híbrido + consumo Verification Report

**Phase Goal:** Usuário registra abastecimento (odômetro, litros, tanque-cheio, combustível) com custo de fonte única (lançamento vinculado XOR manual — D2); sistema calcula km/l tanque-cheio (D3) + R$/km via views security_invoker e expõe médias por carro.
**Verified:** 2026-06-17T15:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Cost-source XOR rejects BOTH transactionId+amountCents and NEITHER | ✓ VERIFIED | `abastecimento.ts:49-60` superRefine `hasTx === hasAmount` → COST_SOURCE_MESSAGE; DB `abastecimentos_cost_xor` CHECK (0027:60-63); schema.test cases lines 69/80; action test XOR both/neither |
| 2  | On 'from fatura' the server verifies the tx is the caller's OWN expense AND not already linked, then stamps carro_id | ✓ VERIFIED | `abastecimentos.ts:95-135` assertOwnedTransaction + 1:1 pre-check + insert then `transactions.update({carro_id}).eq('id',transactionId)`; integration test reads carro_id back = A's carro |
| 3  | createAbastecimento re-derives carro_id ownership (assertOwnedCarro) before FK write; never throws — returns {ok}|{error} | ✓ VERIFIED | `abastecimentos.ts:85-89,32` ActionResult union; tri-state assertOwnedCarro (`ownership.ts:153-160`); all paths return, no throw |
| 4  | Linking another user's (forged) tx writes nothing; carro_id never set on a foreign tx | ✓ VERIFIED | assertOwnedTransaction returns false → `{error:'Lançamento inválido.'}` before any write; integration test "B's tx carro_id stays null" (action test:12,178 area) |
| 5  | Manual path writes amount_cents, transaction_id null; from-fatura leaves amount_cents null | ✓ VERIFIED | `abastecimentos.ts:55-67` abastecimentoWriteFields: `transaction_id ?? null`, `amount_cents ?? null` (exclusive per schema); integration test asserts both shapes |
| 6  | v_abastecimento_consumo computes full-tank km/l + R$/km with km_rodados<=0 excluded from averages | ✓ VERIFIED | `0028:107` intervals WHERE `(odometro_km - prev_full_odometro) > 0`; `0028:118-126` CASE guards `km_rodados <= 0 → null`; carro-consumo.test 6/6 (km/l≈12.5, bad interval excluded) |
| 7  | v_carro_resumo exposes per-car averages built off the consumo view | ✓ VERIFIED | `0027:198-238` `from public.v_abastecimento_consumo`, `avg(...) filter (where ... is not null)`, grouped by carro_id; page reads km_por_litro_medio/reais_por_km_medio |
| 8  | Both views keep security_invoker = true | ✓ VERIFIED | `0028:46` and `0027:113,199` `with (security_invoker = true)`; carro-view-leak.test 4/4 (second user reads zero foreign rows) |
| 9  | preco_litro is derived never stored | ✓ VERIFIED | No preco_litro column on abastecimentos (0027:50-58); derived in view (0027:206-209) + `consumo.ts:20-27` precoLitroCents; carro-consumo.test asserts `select preco_litro` errors |
| 10 | litros is numeric volume, not money | ✓ VERIFIED | `0027:52` `numeric(7,3) not null check (litros > 0)`; `abastecimento.ts:35-37` `z.number().positive()` (no centavos); form uses decimal Input not MoneyInput (`abastecimento-form.tsx:262-276`) |
| 11 | Action result shape never throws | ✓ VERIFIED | create/update/delete all return `{error}`|`{ok:true}`; DB errors mapped to friendly strings (`abastecimentos.ts:118-121,192-194,225-226`) |
| 12 | 1:1 transaction↔abastecimento link enforced | ✓ VERIFIED | pre-check select (`abastecimentos.ts:101-108`) + partial unique `abastecimentos_transaction_uniq` (0027:67) + 23505 race map (118-119) |
| 13 | Tie-break deterministic for equal odometers | ✓ VERIFIED | `0028:56-59` lag window `order by odometro_km, occurred_on, created_at, id` |
| 14 | carros rejects ano outside 1900..2100 and off-enum combustivel; nulls valid | ✓ VERIFIED | `0028:24-33` carros_ano_chk (literal 2100) + carros_combustivel_padrao_chk |
| 15 | User opens dialog, picks cost source, saves fuel-up from /carros/[id] | ✓ VERIFIED | `abastecimento-form.tsx` Tabs Da fatura/Manual; page renders trigger (`page.tsx:211-216`); human-verify APPROVED (10-03-SUMMARY) |
| 16 | tanque-cheio defaults ON; combustível defaults to carro's combustivel_padrao | ✓ VERIFIED | `abastecimento-form.tsx:127-130,143-144` `useState(edit?.tanqueCheio ?? true)`, `combustivel ?? combustivelPadrao ?? ''` |
| 17 | History lists date/odômetro/litros/custo/tanque-cheio/km-l do intervalo (table→card) | ✓ VERIFIED | `abastecimento-history.tsx` Table + custoLabel + kmPerLitroLabel; page feeds rows + kmPorLitroById map (`page.tsx:120-160`) |
| 18 | km/l médio + R$/km render as numbers (tabular-nums); '—' for null | ✓ VERIFIED | `consumo.ts:40-62` kmPerLitroLabel/reaisPerKmLabel return SENTINEL '—' for null; page reads resumo averages (`page.tsx:81-85,222-223`) |

**Score:** 18/18 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Same-odometer double-count in v_abastecimento_consumo (WR-02) | Phase 11 | 10-REVIEW-FIX.md: orchestrator-triaged deferral; near-impossible anomaly; 0029 view refinement is Phase-11 scope. Not a Phase-10 gap. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0028_carros_fix.sql` | carros CHECKs + corrected v_abastecimento_consumo | ✓ VERIFIED | 129 lines; both CHECKs, tie-break, <=0 guard, security_invoker; applied locally |
| `tests/carro-consumo.test.ts` | consumption-view integration proof | ✓ VERIFIED | 6/6 green in isolation (2.5s) |
| `src/lib/schemas/abastecimento.ts` | Zod XOR + field bounds | ✓ VERIFIED | superRefine XOR; shared COMBUSTIVEL_OPTIONS; int/positive bounds |
| `src/actions/abastecimentos.ts` | dual IDOR + XOR + carro_id sync | ✓ VERIFIED | create/update/delete; exports all 3; never throws |
| `src/lib/carro/consumo.ts` | preco_litro + km/l + R$/km helpers | ✓ VERIFIED | precoLitroCents + labels + '—' sentinel; pure, no DB |
| `src/lib/ownership.ts` (assertOwnedTransaction) | tx ownership re-derive | ✓ VERIFIED | exactly-1-row boolean (123-130) |
| `src/components/abastecimento-form.tsx` | dialog + segmented toggle | ✓ VERIFIED | 356 lines; wired to createAbastecimento/updateAbastecimento |
| `src/components/transacao-picker.tsx` | searchable unlinked-expense picker | ✓ VERIFIED | filterable list; empty hint |
| `src/components/abastecimento-history.tsx` | table→card + averages | ✓ VERIFIED | Table + cards + averages block + edit/delete |
| `src/app/(app)/carros/[id]/page.tsx` | Abastecimentos section + RLS reads | ✓ VERIFIED | reads abastecimentos + v_abastecimento_consumo + v_carro_resumo |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| v_abastecimento_consumo | v_carro_resumo | averages off the view (one source) | ✓ WIRED | `0027:210` `from public.v_abastecimento_consumo` |
| database.types.ts | migration up + gen:types | no drift | ✓ WIRED | tsc clean; SUMMARY git diff --quiet exit 0 |
| abastecimentos.ts | transactions.carro_id | set carro_id on link | ✓ WIRED | `abastecimentos.ts:128-131` update carro_id-only payload |
| abastecimentos.ts | assertOwnedCarro + assertOwnedTransaction | dual re-derive before FK | ✓ WIRED | both imported + called pre-write (lines 85,96) |
| abastecimento-form.tsx | createAbastecimento/updateAbastecimento | action on submit | ✓ WIRED | `abastecimento-form.tsx:201-204` |
| page.tsx | v_abastecimento_consumo + v_carro_resumo | RLS-scoped reads | ✓ WIRED | `page.tsx:70-85` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| page.tsx history | abastecimentoRows | abastecimentos select + transactions embed | ✓ real query | ✓ FLOWING |
| page.tsx km/l per interval | kmPorLitroById | v_abastecimento_consumo select | ✓ real view | ✓ FLOWING |
| page.tsx averages | resumo | v_carro_resumo maybeSingle | ✓ real view | ✓ FLOWING |
| page.tsx picker | transacoes | transactions select (kind=expense, unlinked, carro filter) | ✓ real query, filtered | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript types | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Production build | `npm run build` | exit 0, /carros/[id] compiled | ✓ PASS |
| Schema/action/consumo unit tests | `npm test -- abastecimento.test.ts abastecimentos.test.ts consumo.test.ts abastecimento-action.test.ts` | 50 passed | ✓ PASS |
| Consumption-view integration | `npm test -- carro-consumo.test.ts` (isolation) | 6 passed | ✓ PASS |
| carro RLS integration | `npm test -- carro-rls.test.ts` (isolation) | 7 passed | ✓ PASS |
| view-leak (security_invoker) | `npm test -- carro-view-leak.test.ts` (isolation) | 4 passed | ✓ PASS |

Note: integration suites (carro-consumo, carro-rls, carro-view-leak) time out in their `beforeAll` user-seed hook (10s limit) when run concurrently/back-to-back against the local auth stack — the same local-stack-under-parallel-load env flakiness documented for `lgpd-export.test.ts`. Every suite is green in isolation. Not a Phase-10 regression.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CAR-03 | 10-02, 10-03 | Registra abastecimento com custo de fonte única (CHECK XOR, nunca ambas/nenhuma) | ✓ SATISFIED | Zod XOR + DB cost_xor CHECK; form + actions + history shipped; integration test green. (REQUIREMENTS.md:218 "In progress" line predates 10-03 completion — implementation now complete.) |
| CAR-04 | 10-01, 10-02 | km/l tanque-cheio + R$/km por intervalo + médias por carro (views security_invoker) | ✓ SATISFIED | both views security_invoker; <=0 guard; averages off the view; carro-consumo.test 6/6. REQUIREMENTS.md:219 marked Complete. |

No orphaned requirements: REQUIREMENTS.md maps only CAR-03/04 to Phase 10, both claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) | — | TODO/HACK grep hits were false positives (`placeholder=` HTML attrs, `setOdometro` substring). No real markers. |

### Gaps Summary

No gaps. All 18 observable truths are verified against the codebase: the cost-source XOR is enforced at both the Zod boundary and the DB CHECK; the dual ownership re-derive (carro + transaction) gates every FK write and the carro_id stamp on the linked transaction; the consumption views keep security_invoker, exclude km_rodados<=0 intervals from per-interval values and per-car averages, derive preco_litro without storing it, and tie-break deterministically; litros is a numeric volume; actions return a result shape and never throw; and the UI slice (form + segmented toggle + picker + history + averages) is wired over the proven contract with human-verify approved.

The one outstanding review item (WR-02, same-odometer double-count) is an orchestrator-triaged deferral to Phase 11 (near-impossible anomaly, 0029 view-refinement scope) and does not block the Phase-10 goal.

Gates run by the verifier: `npx tsc --noEmit` exit 0, `npm run build` exit 0, the carro/abastecimento/consumo test files green (unit suites in one run; the three local-stack integration suites green in isolation, their concurrent-run beforeAll timeouts being the known local-auth-under-load flakiness, not a regression).

---

_Verified: 2026-06-17T15:55:00Z_
_Verifier: Claude (gsd-verifier)_
