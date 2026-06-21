---
phase: 25
slug: fix-de-scroll-na-cria-o-de-palavra-chave
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 25-RESEARCH.md § Validation Architecture (Vitest + UAT Chrome MCP, D-06).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + @testing-library/react |
| **Config file** | `vitest.config.ts` (+ `vitest.setup.ts`) |
| **Quick run command** | `npx vitest run src/actions/category-keywords.test.ts src/components/import-review-table.test.tsx` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~quick: secs · full: existing repo suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/actions/category-keywords.test.ts src/components/import-review-table.test.tsx`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite green + UAT vivo (scroll preservado + re-classify visível)
- **Max feedback latency:** ~ quick-run seconds

---

## Per-Task Verification Map

> Task IDs assigned by the planner. Rows below are requirement-grounded behaviors the planner MUST cover with `<automated>` verify (or route to Manual-Only with justification).

| Behavior | Requirement | Test Type | Automated Command | File Exists | Status |
|----------|-------------|-----------|-------------------|-------------|--------|
| `addKeywordInline` NÃO chama `revalidatePath`; `addKeyword` continua chamando | UX-01 | unit | `npx vitest run src/actions/category-keywords.test.ts` | ✅ estender | ⬜ pending |
| Helper privado bit-idêntico: 4 guards + dup pre-check + 23505 valem p/ ambas as actions | UX-01 | unit | idem | ✅ estender | ⬜ pending |
| Re-classify aplica em `category_id === null` e sobrescreve `origin ∈ {memória,palavra-chave}` | UX-02 | unit | `npx vitest run src/components/import-review-table.test.tsx` | ✅ estender | ⬜ pending |
| Re-classify PRESERVA `origin === 'manual'` | UX-02 | unit | idem | ✅ estender | ⬜ pending |
| Linha re-classificada recebe `origin === 'palavra-chave'` e nenhum `confidence` | UX-02 | unit | idem | ✅ estender | ⬜ pending |
| Keyword degenerada (`*`/`**`) → no-op (`compileRule` null) | UX-02 | unit | idem | ✅ estender | ⬜ pending |
| Scroll não pula + outras linhas atualizam ao criar inline | UX-01+UX-02 | manual | UAT Chrome MCP | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Estender `src/actions/category-keywords.test.ts` — assert `addKeywordInline` NÃO revalida + paridade de guards/dup/23505 (modelo: asserts `revalidatePath` em L161/L361/L390/L419)
- [ ] Estender `src/components/import-review-table.test.tsx` — testes da função pura `reclassifyRowsWithKeyword` (null+memória+palavra-chave sobrescrevem; manual preserva; provenance→'palavra-chave'; degenerada no-op)
- [ ] Sem framework/config a instalar — infra existente cobre.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scroll preservado após criar keyword inline | UX-01 | Scroll jump é runtime do Router Cache no browser — não reproduzível em jsdom | UAT Chrome MCP: criar keyword inline numa linha de baixo da grid `/importar/[id]`; confirmar que a página NÃO pula pro topo |
| Re-classify visível ao vivo na grid | UX-02 | Re-render visual de badges/categoria é comportamento de browser | UAT Chrome MCP: após criar a keyword, confirmar que outras linhas casando atualizam categoria + badge 'palavra-chave' sem refresh; manual intocado |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < quick-run seconds
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
