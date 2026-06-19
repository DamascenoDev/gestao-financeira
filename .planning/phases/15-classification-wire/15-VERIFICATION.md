---
phase: 15-classification-wire
verified: 2026-06-18T21:15:00Z
status: passed
closed_by: quick-task 260619-d68 (PROD live smoke, 2026-06-19)
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Configure a real BYOK key (Gemini ou Claude) em /conta/configuracoes-ia no stack LOCAL, faça upload de uma fatura contendo um merchant NOVO (cache-miss), e observe a linha receber uma sugestão de categoria real da IA na review grid."
    expected: "A linha do merchant novo exibe row.suggestion (source 'ia') com uma categoria possuída pelo usuário; merchants já conhecidos não disparam chamada de IA; o upload conclui normalmente."
    why_human: "É a behavior headline user-visible do phase (sugestão real da IA fluindo num upload). Exige uma chave de provedor real + stack LOCAL — os caminhos no-key / erro / malformado / enum-drift estão 100% provados por unit tests, mas a chamada real de provedor não pode ser exercida sem credencial viva. Decisão honesta: marcar human_needed para esse único smoke ao vivo."
  - test: "Confirmar em PROD (Vercel) que o segmento da rota de importar herda maxDuration ≥ 60 cobrindo parse + 1 chamada batched de IA."
    expected: "O segmento importar/page.tsx (maxDuration = 60) cobre o ingestStatement invocado dessa página em PROD; o parse + a chamada de IA não estouram o timeout da function."
    why_human: "Inheritance de route-segment maxDuration em PROD é um concern de deploy Vercel (Phase 14/0033), não verificável estaticamente no codebase. O export const maxDuration = 60 está presente e correto na page; a herança ao vivo depende do deploy."
---

# Phase 15: Classification Wire Verification Report

**Phase Goal:** Para descritor novo (cache-miss da memória), o sistema chama a IA do provedor configurado e anexa uma sugestão de categoria à linha — memory-first (zero IA p/ merchant conhecido), uma chamada batched/deduplicada por upload, restrita ao enum vivo do usuário, degradando graciosamente para o pick manual em qualquer falha. A IA nunca auto-commita; o upload nunca falha por causa dela.
**Verified:** 2026-06-18T21:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + CLSAI-01..06)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Upload com merchant NOVO → IA sugere categoria anexada como `row.suggestion`; upload só com conhecidos faz ZERO chamadas (memory-first) — CLSAI-01/02 | ✓ VERIFIED | `import.ts:430-492` PASS1 memory loop collects miss set, PASS2 attaches `row.suggestion`. Test `0-call-when-all-hits` (import.test.ts:491) asserts `classifyDescriptors` AND `getDecryptedAiSettings` `not.toHaveBeenCalled()` when all hits. The *real-key* live suggestion is routed to human verification. |
| 2 | Descritores não-vistos deduplicados → UMA chamada de IA por upload (custo ∝ unique-unseen) — CLSAI-03 | ✓ VERIFIED | `import.ts:469-479` collects a `Set<string>` of miss descriptor_norm, ONE `classifyDescriptors([...missNorms], …)` call, skipped when set empty. Test `1-call-N-unique` (import.test.ts:508): 4 rows / 2 unique → `toHaveBeenCalledTimes(1)` with deduped `['netflix com','padaria sao joao']`. `classify.ts:101-139` is exactly one `doGenerate`; empty-input → 0 calls (classify.test.ts:65,72). |
| 3 | Sugestão restrita às categorias ATUAIS via `validateSuggestion` (enum vivo); nada encaixa → slot vazio — CLSAI-04 | ✓ VERIFIED | `classify.ts:127` runs every returned `categoryId` through `validateSuggestion` (suggest.ts:50, `z.enum` over owned ids → null if not owned). Categories fetched at call time (`import.ts:407-410`). Tests: enum-drift→null (classify.test.ts:93), null pass-through (106), validateSuggestion injection/non-string→null (suggest.test.ts:55-73). |
| 4 | Sem chave / chave inválida / erro / rate-limit / malformado degrada para pick manual; upload + grid usáveis (try/catch → {}) — CLSAI-06 | ✓ VERIFIED | `classify.ts:111-136` single inner try/catch → `new Map()` on ANY failure, no retries. Tests: reject (classify.test.ts:120), malformed JSON (126), schema failure (134). `import.ts:471-479` sets non-blocking `iaIndisponivel` on no-key / empty-Map; upload returns normally. Tests fallback-no-key (import.test.ts:577) + fallback-empty-map (592). |
| 5 | NENHUMA sugestão auto-commitada: `merchant_patterns` escrito SÓ no `confirmImport` em confirmação humana; loop v1.3 intacto — CLSAI-05 | ✓ VERIFIED | `import.ts:484-492` attaches `row.suggestion` only, NEVER `row.category_id`; memory hit never overwritten. Test `no-auto-commit` (import.test.ts:523) asserts `category_id` stays null + hint attached; `no-auto-commit: memory hit never overwritten` (556). Only `merchant_patterns` write is `import.ts:833` inside `confirmImport`. Git diff of all Phase-15 commits (`e51f9e0~1..ffedc3e`) shows ZERO changes to the confirmImport learn loop. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/ai/classify.ts` | Batched single `doGenerate` classifier, flat schema, enum-gate, never-throw | ✓ VERIFIED | ONE doGenerate (line 113), flat hand-written JSONSchema7 (no $ref), `validateSuggestion` post-validate (127), inner try/catch → Map() (131-136), empty-input → 0 calls (109). No `ai` umbrella. |
| `src/actions/import.ts` | Two-pass wire: PASS1 memory + collect misses; ONE call; PASS2 attach suggestion | ✓ VERIFIED | PASS1 (434-463), ONE call skipped on empty miss set (471-479), PASS2 attach `row.suggestion` never `category_id` (484-492), non-blocking `iaIndisponivel` (98,501). |
| `src/lib/classifier/suggest.ts` | 1-item PII-safe delegate + `validateSuggestion` enum wrapper | ✓ VERIFIED | `suggestCategory` (33-41) reads DAL, null on no-key without fetch, delegates 1-item `classifyDescriptors`; `validateSuggestion` (50-59) z.enum gate. |
| `src/lib/parsers/types.ts` | Additive `ParsedReviewRow.suggestion?` | ✓ VERIFIED | Line 82: `suggestion?: { categoryId; confidence; source: 'ia' }` — additive, optional. |
| `src/app/(app)/importar/page.tsx` | `maxDuration = 60` route segment | ✓ VERIFIED | Line 13: `export const maxDuration = 60`. (Action module cannot carry it — Rule 3 fix `ffedc3e`; bound on page segment, intent preserved.) |
| `tests/pii-guard.test.ts` | Payload egresses ONLY descriptor_norm; no-umbrella invariant | ✓ VERIFIED | Inspects actual `doGenerate.mock.calls[0].prompt` (line 56): asserts descriptor_norm present, no `R$`/date/amount/occurred_on/descriptor_raw (61). No-umbrella assert (51). |
| `tests/fixtures/itau-dup-descriptor.ofx` | 4 rows / 2 unique for M>N dedupe proof | ✓ VERIFIED | Present (971 bytes); drives the 1-call-N-unique test. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `import.ts` | `classify.ts` | `classifyDescriptors([...missNorms], categoryList, aiSettings)` | ✓ WIRED | Direct batched call on hot path (476); NOT per-row `suggestCategory`. |
| `import.ts` | `settings.server.ts` | `getDecryptedAiSettings()` gated on `missNorms.size > 0` | ✓ WIRED | Key read only when there is a miss (472); skipped entirely otherwise. |
| `classify.ts` | `provider-factory.ts` | `modelFor(provider, model, apiKey).doGenerate(...)` | ✓ WIRED | Line 112-121; responseFormat json+schema, no `ai` umbrella. |
| `classify.ts` | `suggest.ts` | `validateSuggestion(r.categoryId, categories)` | ✓ WIRED | Line 127 — enum gate on every result. |
| `suggest.ts` | `classify.ts` | `suggestCategory` delegates 1-item `classifyDescriptors` | ✓ WIRED | Line 39 — exists for contract/test stability; not on ingest hot path. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-15 suites green | `npx vitest run classify.test.ts import.test.ts pii-guard.test.ts suggest.test.ts` | 4 files / 63 tests passed | ✓ PASS |
| Type safety | `npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| No `ai` umbrella (BYOK only) | `node -e` over package.json | `['@ai-sdk/anthropic','@ai-sdk/google']` | ✓ PASS |
| merchant_patterns write isolation | `grep merchant_patterns src/` | only write is `import.ts:833` in confirmImport; memory.ts reads only | ✓ PASS |
| Learn loop untouched by Phase 15 | `git diff e51f9e0~1..ffedc3e -- import.ts` | zero changes to confirmImport learn region | ✓ PASS |
| Real-key live AI suggestion | (needs BYOK key + LOCAL stack) | — | ? SKIP → human verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CLSAI-01 | 15-02 | Sugestão automática via IA no cache-miss | ✓ SATISFIED | Truth 1 (logic); real-key smoke → human |
| CLSAI-02 | 15-02 | IA só no cache-miss (memory-first) | ✓ SATISFIED | Truth 1 / 0-call test |
| CLSAI-03 | 15-01/02 | Deduplicado, uma chamada por upload | ✓ SATISFIED | Truth 2 / 1-call-N-unique test |
| CLSAI-04 | 15-01 | Restrito ao enum vivo (validateSuggestion) | ✓ SATISFIED | Truth 3 / enum-drift→null tests |
| CLSAI-05 | 15-02 | Nenhuma sugestão auto-commitada | ✓ SATISFIED | Truth 5 / no-auto-commit tests + git diff |
| CLSAI-06 | 15-01/02 | Degrada graciosamente; upload nunca falha | ✓ SATISFIED | Truth 4 / fallback tests |

No orphaned requirements — all six CLSAI-01..06 are claimed across the two plans and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None | — | No TBD/FIXME/XXX in any phase-15 file; no stub returns on rendered data paths. The `return new Map()` / `return out` empty-Map paths are the intentional CLSAI-06 fallback, not stubs. |

### Human Verification Required

#### 1. Real-key live AI suggestion smoke (headline user-visible behavior)

**Test:** Configure a real BYOK key (Gemini ou Claude) em `/conta/configuracoes-ia` no stack LOCAL, faça upload de uma fatura com um merchant NOVO (cache-miss), e observe a linha receber uma sugestão de categoria real da IA na review grid.
**Expected:** A linha do merchant novo exibe `row.suggestion` (source 'ia') com uma categoria possuída; merchants conhecidos não disparam chamada; upload conclui normalmente.
**Why human:** Exige chave de provedor real + LOCAL. Todos os caminhos no-key/erro/malformado/enum-drift estão 100% provados por unit tests, mas a chamada real de provedor não pode ser exercida sem credencial viva. É a behavior headline do phase — vale eyeballing.

#### 2. PROD maxDuration inheritance

**Test:** Confirmar em PROD (Vercel) que o segmento da rota de importar herda `maxDuration ≥ 60` cobrindo parse + 1 chamada batched de IA.
**Expected:** O segmento `importar/page.tsx` (maxDuration = 60) cobre o `ingestStatement` invocado dessa página; parse + IA não estouram o timeout.
**Why human:** Inheritance de route-segment maxDuration em PROD é concern de deploy Vercel, não verificável estaticamente. O `export const maxDuration = 60` está presente e correto.

### Gaps Summary

No gaps. All five ROADMAP Success Criteria (CLSAI-01..06) are achieved in the codebase and proven by 63 passing unit tests with strong, assertion-rich behavioral coverage: the memory-first zero-call path, the single deduped batched call, the live-enum gate, the never-throw {} fallback, and the no-auto-commit guarantee (with the v1.3 confirm/learn loop verifiably untouched by git diff). `tsc --noEmit` is clean and the no-`ai`-umbrella BYOK invariant holds.

Status is `human_needed` (not `passed`) solely because the **headline user-visible behavior — a real AI suggestion appearing on a new-merchant upload — requires a live provider key** that cannot be exercised in this environment. The wiring logic around that call is fully proven; only the live smoke (and the PROD maxDuration inheritance) remain for human eyeballing. Per the verification decision tree, a non-empty human-verification section makes `passed` invalid even with 5/5 logic truths verified.

---

_Verified: 2026-06-18T21:15:00Z_
_Verifier: Claude (gsd-verifier)_

---

## Live Smoke Closure — 2026-06-19 (quick-task 260619-d68)

**Status flipped `human_needed → passed`.** Both deferred items are confirmed live in PROD:

1. **Real-key AI suggestion (headline behavior):** a new-merchant OFX upload produced a real `gemini-2.5-flash-lite` suggestion attached as `row.suggestion` and rendered in the review grid. Memory-first held (known descriptors fire zero AI calls); the batched single call ran on the unique miss set.
2. **`maxDuration` inheritance:** the `ingestStatement` server action (bound by `importar/page.tsx` `maxDuration = 60`) completed parse + the batched classify well within the limit — the successful classify returned in ~1–3s; provider errors returned even faster (~100ms–2s).

**Debugging journey (operational, not code defects):** the wire was proven correct throughout; the only blockers were the external provider:
- `gemini-2.5-flash-lite` (shipped default) intermittently returns transient **503 "high demand"** on free tier → CLSAI-06 degrades to empty Map, upload completes, no crash. A re-upload retries and lands.
- A mid-debug switch to `gemini-2.0-flash` surfaced that it is **paid-tier-only** for this key (**429 RESOURCE_EXHAUSTED, free_tier limit:0**); reverted to flash-lite. `gemini-3.5-flash` is a thinking model that stalls the 1-token `testConnection` ping.
- Net: the shipped flash-lite default is correct; `getDecryptedAiSettings` now reads the model **live** from `DEFAULT_MODEL` (no key re-save needed on a model swap).

Verified live by the user against `https://gestao-financeira-ebon-mu.vercel.app`. Side-bugs found during the smoke are filed as todos (see quick-task SUMMARY).
