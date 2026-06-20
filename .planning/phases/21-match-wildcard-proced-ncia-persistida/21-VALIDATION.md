---
phase: 21
slug: match-wildcard-proced-ncia-persistida
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | none new — `keywords.test.ts`, `import.test.ts`, `category-keywords.test.ts` já rodam; `normalize.test.ts` criado no 21-01 se ausente |
| **Quick run command** | `npx vitest run src/lib/classifier/keywords.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10–20 segundos |

---

## Sampling Rate

- **After every task commit:** Run o arquivo de teste tocado (`npx vitest run <test-file>`)
- **After every plan wave:** Run `npx vitest run` (suíte completa)
- **Before `/gsd-verify-work`:** Suíte completa verde + smoke live em PROD (KW-10 — ver Manual-Only)
- **Max feedback latency:** ~20 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | KW-09 | T-21-01 | normalizeKeyword preserva `*`, idêntico ao descriptor no resto | unit | `npx vitest run src/lib/normalize.test.ts` | ✅ extend / ❌ W0 cria se ausente | ⬜ pending |
| 21-01-02 | 01 | 1 | KW-09 | T-21-01 | addKeyword preserva `*` (asserção de maior valor) + rejeita literal-count-0 | unit | `npx vitest run src/actions/category-keywords.test.ts` | ✅ extend | ⬜ pending |
| 21-02-01 | 02 | 1 | KW-09 | T-21-03/04/05 | glob ancorado ReDoS-safe + especificidade literal-count; substring v1.5 intacto; degenerado pulado; metachar escapado | unit | `npx vitest run src/lib/classifier/keywords.test.ts` | ✅ extend | ⬜ pending |
| 21-03-01 | 03 | 1 | KW-10 | T-21-06 | migration 0037 dropa o CHECK live correto e amplia para 'palavra-chave' | manual/file | `test -f supabase/migrations/0037_*.sql && grep -c "palavra-chave" supabase/migrations/0037_*.sql` | ✅ novo | ⬜ pending |
| 21-03-02 | 03 | 1 | KW-10 | T-21-07 | INSERT de 'palavra-chave' aceito live (sem 23514); gen:types no-op | manual (DB live) | human-check (db push + INSERT smoke) | ✅ live | ⬜ pending |
| 21-04-01 | 04 | 2 | KW-09 | T-21-11 | glob casa no upload ponta-a-ponta via compileRule no pre-fetch | integration (mocked) | `npx vitest run src/actions/import.test.ts -t "palavra-chave"` | ✅ extend | ⬜ pending |
| 21-04-02 | 04 | 2 | KW-10 | T-21-09/10/11/12 | re-derivação server-side: keyword→'palavra-chave', memória→'memória', manual/IA/sobrescrito→coarse; batched; guard de igualdade | integration (mocked) | `npx vitest run src/actions/import.test.ts -t "confirmImport"` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/normalize.test.ts` — criar SE ausente (21-01 Task 1 cobre normalizeKeyword + um caso de regressão de normalizeDescriptor); os demais arquivos de teste já existem e a obra é extensão, não bootstrap.

*Os três arquivos centrais (`keywords.test.ts`, `import.test.ts`, `category-keywords.test.ts`) existem e o framework está configurado — sem gap de bootstrap (RESEARCH §Wave 0 Gaps).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| INSERT de classification_source='palavra-chave' aceito live | KW-10 | O CHECK ampliado só existe após `supabase db push` (local + PROD); build/type-check passam sem ele (falso-positivo). Testes de integração Supabase são env-flaky (dev-env memory). | Aplicar 0037 (`supabase db push`), depois inserir uma transaction de teste com classification_source='palavra-chave' (ou via Plano 04) e confirmar que NÃO falha 23514. |
| Smoke live ponta-a-ponta em PROD | KW-09 + KW-10 | A verdade de persistência é mais confiável num round-trip real que num mock. | Em PROD: cadastrar a keyword `UBER*` numa categoria; subir um statement com um descritor `UBER TRIP 123`; confirmar; verificar que o badge/procedência persiste como 'palavra-chave'. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (21-03-02 é human-check por ser DB live; documentado em Manual-Only)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (apenas normalize.test.ts se ausente)
- [x] No watch-mode flags (todos `vitest run`, não `vitest`)
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-20
