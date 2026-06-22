---
phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
plan: 06
subsystem: api
tags: [abastecimento, vinculo-reverso, confirm-import, security, no-double-count, supabase, zod]

# Dependency graph
requires:
  - phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
    provides: link-write de confirmImport (CAR-10/CAR-11), junction abastecimento_parcelas, IDOR re-derive
provides:
  - "confirmImport endurecido: guarda 1-tx-1-vínculo (WR-01), kind server-derivado de parcelas_total (WR-02), cap parcela_num<=parcelas_total (WR-03), linkFailed acumulado em vez de early-return (WR-04)"
  - "confirmImportRowSchema sem parcelaNum (IN-01) — campo morto/trust-smell removido do boundary"
  - "4 testes adversariais DB-integration provando os 4 WARNINGs do code review"
affects: [abastecimento, import, confirm-import, code-review-followup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server re-derive do KIND (não só ownership): além do IDOR re-derive de abastecimentoId, o confirmImport agora re-deriva o write-path de parcelas_total via UM fetch batched .in('id',…), rejeitando um kind divergente do cliente antes de qualquer write"
    - "Guarda cross-row no action layer (linkedTxns Set): o resíduo que nenhum unique index DB pega — uma tx vinculada a dois abastecimentos — é fechado rejeitando o payload no 2º vínculo à mesma tx"
    - "Falha parcial consistente: acumular flag + continue em vez de early-return no meio do loop, surface do aviso só após LEARN+status (estado independente da ordem das linhas)"

key-files:
  created: []
  modified:
    - src/actions/import.ts
    - src/lib/schemas/import.ts
    - src/components/import-review-table.tsx
    - tests/import-abastecimento-link.test.ts

key-decisions:
  - "WR-01/WR-02: rejeitar o PAYLOAD INTEIRO (não skip silencioso) num 2º vínculo à mesma tx e num kind divergente — consistente com o gate IDOR que também rejeita o payload todo"
  - "WR-02: o fetch de parcelas_total é UMA query .in('id', linkAbastecimentoIds) separada (não fundida ao IDOR re-derive, que usa assertOwnedAbastecimento per-id) — mantém o batching exigido sem reescrever o gate IDOR já testado"
  - "WR-04: ConfirmImportResult ganhou a variante { error; imported; duplicated } para surface o aviso de vínculo mantendo as contagens preenchidas (em vez de descartar imported/duplicated no erro)"
  - "IN-01: parcelaNum REMOVIDO do schema e do payload do runConfirm (não só comentado) — fica client-only no ReviewRow; o servidor recomputa parcela_num server-side"

patterns-established:
  - "Re-derive de KIND server-side: confiar no parcelas_total do server, nunca no abastecimentoKind do cliente, ramificando o write sempre no serverKind"
  - "linkedTxns Set: 1 tx → no máximo 1 vínculo por confirm (fecha o resíduo cross-row da migration 0039)"

requirements-completed: [CAR-10, CAR-11, CAR-12]

# Metrics
duration: ~25min
completed: 2026-06-22
status: complete
---

# Phase 28 Plan 06: Endurecimento do link-write de confirmImport (WR-01..04 + IN-01) Summary

**confirmImport blindado contra payload hostil no confirm de abastecimento: guarda 1-tx-1-vínculo (sem double-count cross-row), kind re-derivado server-side de parcelas_total via fetch batched, cap de parcelas, e falha parcial consistente que deixa LEARN+status rodarem — provados por 4 testes adversariais DB-integration.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-06-22T22:06:19Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- **WR-01 (sem double-count, CAR-11/CAR-12):** `Set<string> linkedTxns` rejeita o payload no 2º vínculo apontando para a mesma tx — fecha o resíduo cross-row que a migration 0039 (L22-30) delega EXPLICITAMENTE à action layer (à-vista em AB1 + parcela em AB2 não viola nenhum unique index mas dobra o custo em `v_abastecimento_consumo`).
- **WR-02 (kind server-derivado):** `serverKind` deriva de `parcelas_total` (>1 → 'parcela', senão 'avista'), lido de UM fetch batched `.in('id', linkAbastecimentoIds)` (nunca per-row); um `abastecimentoKind` do cliente que discorda rejeita o payload ANTES de qualquer write (não cai em 23514 cost_xor depois da tx landar). O write ramifica SEMPRE em `serverKind`.
- **WR-03 (cap de parcelas, CAR-11):** guarda `parcelaNum > parcelas_total → continue` antes do insert da parcela — abastecimento já completo nunca recebe uma parcela fantasma.
- **WR-04 (falha parcial consistente):** os 3 early-returns de falha não-23505 dentro do loop viraram `linkFailed = true; continue`; o loop termina, LEARN + `status='imported'` rodam, e o aviso de vínculo é surfaced só no return final (estado independente da ordem das linhas). `ConfirmImportResult` ganhou a variante `{ error; imported; duplicated }`.
- **IN-01:** `parcelaNum` removido do `confirmImportRowSchema` e do payload do `runConfirm` em `import-review-table.tsx` (fica client-only no `ReviewRow`).
- **4 testes adversariais** DB-integration (`supabase start` local) provando cada WARNING contra o schema vivo.

## Task Commits

Cada task commitada atomicamente:

1. **Task 1: Endurecer o link-write de confirmImport (WR-01..04) + limpar o schema (IN-01)** - `ed0a765` (fix)
2. **Task 2: Testes adversariais DB-integration para WR-01..04** - `7e457ea` (test)

## Files Created/Modified
- `src/actions/import.ts` - Bloco de link-write endurecido: fetch batched de id+parcelas_total, `serverKindById`/`parcelasTotalById`, rejeição de kind divergente (WR-02), `linkedTxns` (WR-01), cap de parcela_num (WR-03), `linkFailedFlag` + return final com aviso (WR-04); `ConfirmImportResult` com a 3ª variante.
- `src/lib/schemas/import.ts` - `parcelaNum` removido do `confirmImportRowSchema` (IN-01); JSDoc atualizado refletindo o re-derive de kind e a remoção.
- `src/components/import-review-table.tsx` - `parcelaNum` retirado do payload do `runConfirm` (client-only no `ReviewRow`); comentário atualizado.
- `tests/import-abastecimento-link.test.ts` - +4 `it` adversariais (WR-01 cross-row double-link → rejeitado + custo uma vez; WR-02 kind divergente → rejeitado via fetch batched, sem 23514; WR-03 over-cap → pulada, junção fica em 3; WR-04 falha parcial FK-23503 → LEARN+status='imported' rodam).

## Decisions Made
- **Fetch de parcelas_total separado do IDOR re-derive:** o IDOR re-derive usa `assertOwnedAbastecimento` per-id (gate já testado as-shipped); a exigência de batching do WR-02 é satisfeita por UMA `.in('id', …)` adicional para id+parcelas_total, sem reescrever o gate IDOR. Mantém ambos os invariantes (ownership + kind) batched sem regressão.
- **Rejeitar o payload inteiro** (WR-01/WR-02) em vez de skip silencioso — consistência com o gate IDOR que rejeita o payload todo numa escolha forjada.
- **`parcelaNum` removido, não comentado** (IN-01) — a opção preferida do review; elimina o trust-smell de carregar um campo cliente-controlado morto no boundary.
- **WR-04 com nova variante de retorno** em vez de canal de warning separado — `{ error; imported; duplicated }` preserva as contagens e o tipo permanece exaustivo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ConfirmImportResult` estendido para a variante de falha parcial (WR-04)**
- **Found during:** Task 1
- **Issue:** O return do WR-04 (`{ error, imported, duplicated }`) não tipava sob o `ConfirmImportResult` original (`{ error } | { imported; duplicated }`), deixando o tsc vermelho — o plano antecipa isso ("ou o shape de retorno que o tipo de confirmImport aceitar").
- **Fix:** Adicionada a 3ª variante `{ error: string; imported: number; duplicated: number }` ao union, com comentário WR-04. O consumidor (`import-review-table.tsx`) já trata `'error' in result` primeiro, então o branch de sucesso permanece correto.
- **Files modified:** src/actions/import.ts
- **Verification:** `npx tsc --noEmit` limpo; suíte cheia verde (1004 testes).
- **Committed in:** `ed0a765` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** A extensão do tipo era necessária para o WR-04 tipar sob strict — antecipada pelo próprio plano. Sem scope creep.

## Issues Encountered
None - ambas as tasks executaram como planejado. O mock de `abastecimentos` em `import.test.ts` já resolvia qualquer select para `[]`, então o novo fetch batched `.in('id',…)` não exigiu extensão do mock (os testes de confirmImport não passam abastecimentoId → `linkRows` vazio → o fetch nunca roda lá).

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- O caminho de confirm de abastecimento está blindado para PROD (segurança + dinheiro): os 4 WARNINGs do code review (28-REVIEW.md) estão fechados e mecanicamente provados.
- Os INFOs IN-02 (`dayDistance` NaN) e IN-03 (carro_id sync no ramo parcelado) NÃO estavam no escopo deste plano (gap-closure mirou os 4 WARNINGs + IN-01) — permanecem como itens de baixo risco para um follow-up se desejado.
- `npx tsc --noEmit` limpo; `npm test` cheia verde (1004 testes, +4 vs. baseline 1000); o fetch de parcelas_total é UMA `.in(...)` batched.

## Self-Check: PASSED

- FOUND: `.planning/phases/28-v-nculo-reverso-por-valor-consumo-sem-double-count/28-06-SUMMARY.md`
- FOUND: `src/actions/import.ts`, `src/lib/schemas/import.ts`, `tests/import-abastecimento-link.test.ts`
- FOUND commits: `ed0a765` (Task 1), `7e457ea` (Task 2)

---
*Phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count*
*Completed: 2026-06-22*
