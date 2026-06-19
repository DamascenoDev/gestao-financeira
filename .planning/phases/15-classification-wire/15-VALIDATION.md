---
phase: 15
slug: classification-wire
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-18
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run src/lib/ai/classify.test.ts src/actions/import.test.ts tests/pii-guard.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched module
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite green + `tsc --noEmit` + `npm run build`
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Seeded from the 15-RESEARCH Validation Architecture (7 edges). Refined by the planner.

| Edge | Requirement | Secure/Observable Behavior | Test Type | Command |
|------|-------------|----------------------------|-----------|---------|
| 0-call-when-all-hits | CLSAI-02 | every descriptor is a memory hit → `classifyDescriptors` NOT invoked (spy) | unit | classify/import test |
| 1-call-N-unique | CLSAI-03 | M rows, N unique misses (M>N) → exactly 1 AI call carrying N descriptors | unit | import test |
| enum-drift→null | CLSAI-04 | AI returns an id not in the owned category list → `validateSuggestion` → null (empty slot) | unit | classify test |
| fallback-no-key | CLSAI-06 | `getDecryptedAiSettings()` → null → empty suggestions, upload proceeds | unit | classify/import test |
| fallback-error | CLSAI-06 | provider throws (401/429/5xx/NoObjectGenerated/malformed) → try/catch → empty Map, upload never fails | unit | classify test |
| no-auto-commit | CLSAI-05 | suggestion attached but `row.category_id` stays null on a miss; `merchant_patterns` untouched until confirmImport | unit | import test |
| PII-descriptorNorm-only | CLSAI-01/SEC-03 | the payload sent to the model contains ONLY descriptor_norm — no amount/date/raw descriptor | unit | pii-guard test (updated) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/ai/classify.test.ts` — RED stubs for the batched call, enum-gate, fallback paths
- [ ] `src/actions/import.test.ts` — extend with the 0-call / 1-call-N-unique / no-auto-commit edges (mock the model)
- [ ] `tests/pii-guard.test.ts` — update assertions (b)/(c) to descriptorNorm-only payload guard
- [ ] vitest already installed — no framework install

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sugestão real de IA aparece num upload com merchant novo | CLSAI-01 | Precisa de uma chave real + LOCAL stack | Configurar chave (Gemini/Claude) em /conta/configuracoes-ia (LOCAL), subir fatura com merchant novo → linha recebe sugestão na grid |
| maxDuration ≥ 60 na rota de import em PROD | CLSAI-06 | Depende do deploy Vercel | Confirmar `maxDuration` cobre parse + 1 call de IA no segmento do ingestStatement |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
