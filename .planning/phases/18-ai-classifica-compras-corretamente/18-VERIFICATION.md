---
phase: 18-ai-classifica-compras-corretamente
verified: 2026-06-19T15:25:00Z
status: human_needed
score: 6/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Aplicar 0035 em PROD (owner): `supabase db push` a partir do ambiente linkado, se 0035 estiver ausente da coluna Remote de `supabase migration list`."
    expected: "0035 aparece na coluna Remote."
    why_human: "Mutação em PROD = ação do dono; Claude nunca roda db push. `supabase migration list` falhou com 'Invalid access token format' (sem SUPABASE_ACCESS_TOKEN no env) → estado remoto não determinável programaticamente."
  - test: "Re-signup em PROD + re-entrar a chave BYOK, abrir /categorias."
    expected: "A categoria default 'Marketplace' (consumo) aparece na lista."
    why_human: "PROD foi wiped 2026-06-19 → exige re-signup manual; não automatizável neste ambiente."
  - test: "Upload de um OFX com um descritor de marketplace nunca visto (ex.: AliExpress, Mercado Livre, Shopee) e inspecionar a grid de revisão."
    expected: "A sugestão da IA cai em 'Marketplace' (ou outra categoria de consumo) — NUNCA em Investimentos/Reserva."
    why_human: "Requer dados em PROD + chamada LLM real; comportamento de runtime não automatizável neste ambiente. Estruturalmente garantido pelo kind gate (18-01) que nula qualquer id de alocação para um gasto."
---

# Phase 18: AI classifica compras corretamente — Verification Report

**Phase Goal:** A camada de IA existente (já wired no v1.4) para de errar a classe de compras de marketplace — há um bucket "Marketplace" disponível em PROD e o prompt instrui o modelo a nunca atribuir categorias de alocação (Investimentos/Reserva) a um gasto.
**Verified:** 2026-06-19T15:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The phase has two requirements with different verifiability: CLSAI-09 (code, fully automatable — VERIFIED) and MKT-01 (PROD data + wiped account, human-verify by design — routed to human verification).

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Cada categoria enviada ao prompt carrega seu kind como tag inline `(consumo)`/`(alocação)` | ✓ VERIFIED | `classify.ts:93` `buildUserText` map: `` `${c.id}: ${c.name} (${c.kind === 'consumo' ? 'consumo' : 'alocação'})` ``. Asserted by test `classify.test.ts:177-178` (userMsg contains `(consumo)` and `(alocação)`). |
| 2 | SYSTEM_PROMPT instrui o modelo a NUNCA atribuir alocação a um gasto e retornar categoryId: null | ✓ VERIFIED | `classify.ts:79` `'Todo descritor é um GASTO. NUNCA atribua uma categoria de alocação a um gasto; … retorne categoryId: null …'` + glossário `:77`. Asserted by `classify.test.ts:180-181` (systemMsg contains `NUNCA atribua` and `categoryId: null`). |
| 3 | Uma sugestão cujo id possuído tem kind='alocacao' é nulada em código, confidence preservada | ✓ VERIFIED | `classify.ts:140-142`: kind lookup AFTER `validateSuggestion`, `kind === 'consumo' ? gatedId : null`; confidence carried into `out.set`. Asserted by `classify.test.ts:196` (allocation id → `{ categoryId: null, confidence: 0.8 }`). |
| 4 | Uma sugestão cujo id possuído tem kind='consumo' passa direto (sem regressão) | ✓ VERIFIED | Same gate admits `kind === 'consumo'`; regression test in `classify.test.ts` kind-gate describe (consumo id passes). 13/13 tests green. |
| 5 | Todos os call sites e as 4 fixtures compilam sob TS estrito com a forma `{id,name,kind}` | ✓ VERIFIED | `classifyDescriptors` (`classify.ts:108`), `suggestCategory` (`suggest.ts:36`), `validateSuggestion` (`suggest.ts:60`) all widened to `{id,name,kind: CategoryKind}`. `import.ts:431` builds `categoryList` with `kind`. 4 fixtures carry `kind:`. `tsc --noEmit` exit 0. |
| 6 | O egress PII permanece descriptor_norm + linhas `id: nome (kind)` — sem valor/data/descritor bruto (SEC-03) | ✓ VERIFIED | `buildUserText` emits only `id: nome (kind)` + descriptor lines; `(kind)` tag is literal `consumo`/`alocação` (not PII). SEC-03 / pii-guard fixtures green within the 13-pass classify suite + 4-fixture set. |
| 7 | A migration 0035 está aplicada em PROD (coluna Remote de `supabase migration list`) | ? HUMAN | `supabase migration list` failed: `Invalid access token format` (no SUPABASE_ACCESS_TOKEN in env). Remote state not determinable. Owner must verify/apply (`supabase db push`). |
| 8 | Após re-signup em PROD, a categoria default 'Marketplace' (consumo) aparece em /categorias | ? HUMAN | PROD wiped 2026-06-19 → requires manual re-signup. Migration `0035` exists in repo and seeds 'Marketplace' (consumo, sort 9) in `handle_new_user` + idempotent backfill (verified in repo), but PROD presence is not automatable. |
| 9 | Num upload de OFX com descritor de marketplace nunca visto, a sugestão da IA cai numa categoria de consumo — nunca Investimentos/Reserva | ? HUMAN | Requires real PROD data + LLM call. Structurally guaranteed by the kind gate (truth #3): any alocação id is nulled for a spend. End-to-end PROD confirmation is human-verify. |

**Score:** 6/9 truths verified (0 present, behavior-unverified). CLSAI-09 (truths 1–6) fully verified from code; MKT-01 (truths 7–9) routed to human verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/ai/classify.ts` | kind tag inline + SYSTEM_PROMPT glossário + regra dura + kind gate + assinatura widened | ✓ VERIFIED | Contains `kind === 'consumo'` (`:93`, `:141`); SYSTEM_PROMPT rule `:79`; gate after `validateSuggestion` `:135-141`; JSON_SCHEMA/classifyResultSchema unchanged (input-only kind). |
| `src/lib/classifier/suggest.ts` | suggestCategory + validateSuggestion widened to `{id,name,kind}` | ✓ VERIFIED | `:36` and `:60` both `{id,name,kind: CategoryKind}`; imports `CategoryKind` (`:20`). |
| `src/actions/import.ts` | select('id, name, kind') + CategoryKind narrowing guard | ✓ VERIFIED | `:424` `.select('id, name, kind')`; `:429-435` `isCategoryKind` type guard (CATEGORY_KINDS) with fail-safe default `'alocacao'` (WR-01 fix `436fe4f`). |
| `src/lib/ai/classify.test.ts` | CATEGORIES fixture w/ kind + alocacao entry + 2 CLSAI-09 describes | ✓ VERIFIED | `:164` "kind-aware prompt (CLSAI-09)", `:185` "kind gate (CLSAI-09)". 13 tests pass. |
| `supabase/migrations/0035_categories_marketplace.sql` | Marketplace default category (data+trigger, pre-existing) | ✓ EXISTS | Present in repo; re-seeds `handle_new_user` w/ 'Marketplace' consumo sort 9 + idempotent backfill. PROD application is human-verify. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `import.ts` | `classify.ts` | `categoryList {id,name,kind}[]` → `classifyDescriptors` | ✓ WIRED | `import.ts:502` `classifyDescriptors([...missNorms], categoryList, aiSettings)`; categoryList carries kind. |
| `suggest.ts` | `classify.ts` | `suggestCategory` delegates to `classifyDescriptors` (inherits kind gate) | ✓ WIRED | Single gate inside batch; no second gate in import.ts (prohibition honored). |
| `0035_...sql` | PROD `public.categories` | `supabase db push` (owner) → handle_new_user re-seed + backfill | ? HUMAN | Repo migration present; PROD apply not automatable (no access token; PROD wiped). |

### Prohibitions

| Prohibition | Verification | Status | Evidence |
| ----------- | ------------ | ------ | -------- |
| kind='alocacao' NUNCA atribuído a um descritor de gasto (vira null) | test | ✓ VERIFIED | `classify.test.ts:196` allocation id → categoryId null. |
| kind NUNCA entra no schema de saída (JSON_SCHEMA/classifyResultSchema intactos) | judgment | ✓ VERIFIED | Schemas byte-unchanged (`classify.ts:37-72`); kind is input context only. Confirmed by code review. |
| NENHUM segundo gate em import.ts; gate só dentro de classifyDescriptors | judgment | ✓ VERIFIED | No kind gating in import.ts; only the type-guard narrowing. Gate lives at `classify.ts:140-141`. |
| Gate compara enum ASCII (`!== 'consumo'`), nunca o rótulo com acento | judgment | ✓ VERIFIED | `classify.ts:141` `kind === 'consumo'` (ASCII); accent only in display label `:93`. |
| Claude NUNCA roda `supabase db push` contra PROD autonomamente | judgment | ✓ VERIFIED | 18-02-SUMMARY: only read-only `migration list` attempted (itself blocked by missing token). No push. |
| NENHUM `gen:types` / regen de database.types.ts | judgment | ✓ VERIFIED | files_modified for 18-02 is empty; no types regen. |
| NENHUMA migration nova nesta fase (0035 já existe) | judgment | ✓ VERIFIED | 0035 dated Jun 19 12:01, pre-existing; no new migration files for this phase. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Kind-aware prompt + kind gate test (CLSAI-09) | `npx vitest run src/lib/ai/classify.test.ts` | 13 passed (was 9, +4 new CLSAI-09) | ✓ PASS |
| TS strict compiles with widened shape at all call sites | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| MKT-01 PROD behavior (Marketplace + consumo suggestion) | requires PROD + LLM | not runnable in this env | ? SKIP → human |

> Note: `npm test` full suite has 4 PRE-EXISTING env-flaky failures (local-Supabase integration tests needing a running stack — project memory: "Supabase integration tests are env-flaky"). Unrelated to this phase; not counted against CLSAI-09. The 4 plan-relevant test files (classify/suggest/pii-guard/import) are green.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CLSAI-09 | 18-01-PLAN | Prompt kind-aware + modelo instruído a não atribuir alocação a gastos | ✓ SATISFIED | Truths 1–6 verified from code; 13 tests green; tsc clean. |
| MKT-01 | 18-02-PLAN | Categoria default 'Marketplace' (0035) aplicada em PROD e presente na conta | ? NEEDS HUMAN | Migration exists in repo; PROD apply + presence not automatable (no token, PROD wiped). Deferred human-verify checkpoint. |

All requirement IDs from both PLAN frontmatters (CLSAI-09, MKT-01) are accounted for and map to REQUIREMENTS.md (lines 21, 25; both mapped to Phase 18). No orphaned requirements.

### Anti-Patterns Found

None blocking. Code review (18-REVIEW.md, status: resolved) found 0 critical, 3 warnings, 1 info:
- WR-01 (unchecked cast) — FIXED (`436fe4f`): now uses `isCategoryKind` type guard with fail-safe default. Verified at `import.ts:429-435`.
- WR-02 — NEUTRALIZED by WR-01.
- WR-03 (archived categories egress) — DEFERRED: pre-existing, not a Phase 18 regression, product decision out of CLSAI-09 scope.
- IN-01 (linear scan vs Map) — SKIPPED: negligible for ~12 categories.

### Human Verification Required

MKT-01 is human-verify by design (PROD data + wiped account, not automatable). The owner must run from the PROD-linked environment:

1. **Apply 0035 in PROD (if absent from Remote).** Run `supabase db push` (or `npm run db:push`). Expected: `0035` appears in the Remote column of `supabase migration list`. (Claude never runs db push; the read-only `migration list` here failed with `Invalid access token format`.)
2. **Re-signup + confirm Marketplace.** Re-signup in PROD (account wiped 2026-06-19), re-enter the BYOK key, open `/categorias`. Expected: "Marketplace" (consumo) is listed.
3. **Marketplace descriptor → consumo suggestion.** Upload an OFX with a never-seen marketplace descriptor (AliExpress / Mercado Livre / Shopee), inspect the review grid. Expected: the AI suggestion is a consumo category (Marketplace or other) — NEVER Investimentos/Reserva. The kind gate (CLSAI-09, truth #3) structurally guarantees an alocação id is nulled for any spend.

### Gaps Summary

No code gaps. The CLSAI-09 code side (Plan 18-01) is fully verified against the codebase: kind-aware prompt, hard anti-allocation rule, post-`validateSuggestion` kind gate nulling non-consumo suggestions, widened `{id,name,kind}` shape threaded through `import.ts` with a safe type-guard narrowing, schemas unchanged, 13 tests green, tsc clean. All 7 prohibitions honored.

MKT-01 is NOT a code gap — it is a deferred human-verify checkpoint. The migration `0035` exists in the repo and the IA kind gate already prevents alocação suggestions for spends regardless of MKT-01. The remaining steps (apply 0035 to PROD, re-signup, confirm Marketplace, confirm a consumo suggestion) require the owner's Supabase credentials and a PROD re-signup, which are not automatable from this environment. Overall status is **human_needed**: all automatable checks pass; one requirement awaits manual PROD verification.

---

_Verified: 2026-06-19T15:25:00Z_
_Verifier: Claude (gsd-verifier)_
