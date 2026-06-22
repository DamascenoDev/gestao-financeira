---
phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
plan: 05
subsystem: testing
tags: [abastecimento, vinculo-reverso, consumo, no-double-count, car-12, verificacao]

# Dependency graph
requires:
  - phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
    plan: 03
    provides: "confirmImport grava o vínculo reverso (à-vista: abastecimentos.transaction_id + transactions.carro_id sync; parcelado: insert abastecimento_parcelas com parcela_num server-computed) — as linhas que alimentam as views da P26"
  - phase: 26-substrato-do-abastecimento-ponta-a-ponta
    provides: "v_abastecimento_consumo / v_carro_resumo (0039/0027, security_invoker) + junção abastecimento_parcelas + cost CASE (parcelado→valor_total_cents ONCE, à-vista→coalesce real/esperado)"
provides:
  - "tests/abastecimento-consumo-no-double-count.test.ts: 4 invariantes DB-integration de CAR-12 — parcelado custo UMA vez sob 0/1/2/3 parcelas vinculadas; à-vista coalesce real over esperado; km/l só litros+odômetro (estável sob vínculo, existente sem fatura); manuais + vinculados ambos no gasto agregado"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Property-style held-out: o nº de parcelas vinculadas na junção VARIA (baseline 0 → 1 → 2 → 3); o custo do parcelado nas views é a INVARIANTE (= valor_total_cents sempre) — prova estrutural de que a junção NÃO alimenta o cost CASE"
    - "Fixtures escolhidos para não mascarar vazamento por acaso: PARCELA_CASH_C=17000 (1×/2×/3× = 17k/34k/51k, nenhum colide com V=60000 nem V+n×cash) — uma soma indevida da junção seria detectada, não escondida"
    - "à-vista coalesce provado antes/depois: custo=esperado pré-vínculo → update transaction_id → custo=real (UMA vez), nunca esperado+real somados"
    - "Sem-fatura = transaction_id null + amount_cents manual (o CHECK abastecimentos_cost_xor exige ≥1 de {transaction_id, amount_cents} no à-vista): km/l existe mesmo assim, derivado só de litros+odômetro"

key-files:
  created:
    - tests/abastecimento-consumo-no-double-count.test.ts
  modified: []

key-decisions:
  - "Held-out incremental na MESMA suíte (it 1): vincula 1→2→3 parcelas lendo o custo após cada passo, em vez de 3 carros separados — prova diretamente que parcelasVinculadas é o parâmetro held-out e o custo a invariante, num único intervalo"
  - "Sem-fatura modelado com amount_cents manual (não null): o CHECK relaxado da 0039 rejeita à-vista com {transaction_id null E amount_cents null}; 'sem fatura vinculada' fiel = transaction_id null + estimativa manual — e o teste asserta explicitamente que nenhum fill tem transaction_id nem parcelas antes de afirmar o km/l"
  - "Manual+vinculado provado via gasto_total_cents de v_carro_resumo (Σ transactions.carro_id): baseline só-manual (18000) → tag de carro_id na tx vinculada (o sync do Plano 03) → 18000+25000, ambos refletidos"
  - "Zero SQL novo de view: a suíte só LÊ as views existentes da P26 (grep create view = 0); CAR-12 é verificação + alimentar, não relatório novo"

patterns-established:
  - "Prova de no-double-count em vínculo reverso: held-out no nº de parcelas + custo invariante nas views + fixtures que não colidem por acaso + assert de que a fatura é dispensável para o km/l"

requirements-completed: [CAR-12]

# Metrics
duration: 2min
completed: 2026-06-22
status: complete
---

# Phase 28 Plan 05: Consumo sem double-count (CAR-12) Summary

**`tests/abastecimento-consumo-no-double-count.test.ts` prova CAR-12 de forma honesta — SEM SQL novo de relatório (grep `create view` = 0): uma suíte DB-integration property-style contra o stack local que, ao alimentar as views da P26 (`v_abastecimento_consumo` / `v_carro_resumo`, security_invoker) com as linhas que o Plano 03 vincula, asseverou as 4 invariantes de custo — (1) o custo do parcelado é `valor_total_cents` contado UMA vez sob 0/1/2/3 parcelas vinculadas (held-out: o nº de parcelas varia, o custo não), (2) o à-vista vinculado usa o REAL via `coalesce(real, esperado)` UMA vez (não esperado+real), (3) o km/l é Δodômetro÷Σlitros, estável sob vínculo e existente sem nenhuma fatura, (4) manuais + vinculados ambos no gasto agregado — 5/5 testes verdes, `npx tsc --noEmit` limpo.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-22T19:27:00Z
- **Completed:** 2026-06-22T19:28:40Z
- **Tasks:** 1
- **Files modified:** 1 (1 criado)

## Accomplishments
- **CAR-12 (1) parcelado UMA vez (held-out, P26 D-05):** o `it` vincula incrementalmente 1, depois 2, depois 3 parcelas em `abastecimento_parcelas` (cada uma = linha na junção + tx com seu próprio cash-flow, exatamente como o link-write do Plano 03) e lê o custo do intervalo após CADA passo — ele é SEMPRE `valor_total_cents` (60000), nunca 2V/3V nem n×cash. Prova estrutural: a junção NÃO alimenta o cost CASE (0039 L161/L198 lê `valor_total_cents` do próprio abastecimento). O preço/litro médio de `v_carro_resumo` também conta o custo do intervalo UMA vez (60000/40 = 1500 cents/L).
- **CAR-12 (2) à-vista coalesce sem double-count:** custo = ESPERADO (30000) pré-vínculo → `update abastecimentos.transaction_id` com uma tx de amount_cents REAL (27000) → custo = REAL UMA vez via `coalesce(t.amount_cents, a.amount_cents)` (0039 L162); asseverado que NÃO é esperado+real somados (90000) nem o esperado.
- **CAR-12 (3) km/l só litros+odômetro:** km_por_litro = Δodômetro÷Σlitros (500/40 = 12.5), idêntico mesmo após as 3 parcelas vinculadas (o custo não entra no km/l); e um carro cujos fills têm `transaction_id` null + `parcelas_total` null (asseverado explicitamente) — SEM nenhuma fatura vinculada — ainda produz km_por_litro não-null (600/40 = 15).
- **CAR-12 (4) manuais + vinculados:** gasto_total_cents de `v_carro_resumo` = só-manual (18000) no baseline → após taguear o carro_id numa tx vinculada (o sync do Plano 03) = 18000+25000 = 43000; AMBOS refletidos no consumo agregado.
- **Zero SQL novo (acceptance):** `grep -ci "create view\|create or replace view"` = 0 — CAR-12 é verificação + alimentar as views existentes da P26, não relatório novo.

## Task Commits

1. **Task 1: teste DB-integration CAR-12 (4 invariantes)** - registrado abaixo (test)

## Files Created/Modified
- `tests/abastecimento-consumo-no-double-count.test.ts` (NOVO) — harness createUser/userClient/serviceClient RLS-ativo clonado de carro-consumo.test.ts (afterAll deleta o user). 5 `it` cobrindo as 4 invariantes de CAR-12 contra o stack local. Helpers `seedTx`/`readParceladoCusto` para o held-out incremental. Só LÊ as views da P26 (nenhum CREATE/REPLACE).

## Decisions Made
- **Held-out incremental na mesma suíte:** o `it` (1) vincula 1→2→3 parcelas lendo o custo após cada passo (baseline 0 parcelas inclusive), em vez de 3 carros separados — torna explícito que `parcelasVinculadas` é o parâmetro held-out e o custo a invariante, num único intervalo. Fixture `PARCELA_CASH_C=17000` escolhido para que nenhum múltiplo (17k/34k/51k) nem `V+n×cash` colida com `V=60000` — um vazamento da junção para o custo seria DETECTADO, não mascarado por acaso (a 1ª execução pegou justamente uma colisão com `PARCELA_CASH_C=20000` → 3×20k=60k, corrigida).
- **Sem-fatura = transaction_id null + amount_cents manual:** o CHECK `abastecimentos_cost_xor` relaxado da 0039 rejeita um à-vista com `{transaction_id null E amount_cents null}` (23514). "Sem fatura vinculada" fiel = `transaction_id` null com estimativa manual; o teste asserta explicitamente que nenhum fill do carro tem `transaction_id` nem `parcelas_total` antes de afirmar que o km/l existe — provando que o km/l não exige a fatura.
- **Manual+vinculado via gasto_total_cents:** `v_carro_resumo.gasto_total_cents` = Σ `transactions.carro_id`; o baseline só-manual + a tag de carro_id na tx vinculada (o sync do Plano 03) provam que ambos entram no agregado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Assertion tautológica no held-out do parcelado (fixture colidente)**
- **Found during:** Task 1 (1ª execução)
- **Issue:** `PARCELA_CASH_C=20000` fazia `3 × cash = 60000 = valor_total_cents`, então a assertion `expect(custo).not.toBe(parcelaNum * PARCELA_CASH_C)` falhava no passo parcelaNum=3 (`expected 60000 not to be 60000`) — a guarda contra "soma da junção" estava mascarada por uma colisão acidental de fixture.
- **Fix:** `PARCELA_CASH_C` ajustado para 17000 (1×/2×/3× = 17k/34k/51k; nenhum colide com V=60000 nem com V+n×cash), restaurando o poder da assertion negativa.
- **Files modified:** tests/abastecimento-consumo-no-double-count.test.ts
- **Commit:** ver Task Commits

**2. [Rule 1 - Bug] Seed do "sem fatura" violava o CHECK abastecimentos_cost_xor**
- **Found during:** Task 1 (1ª execução)
- **Issue:** os fills "sem fatura" usavam `amount_cents: null` E `transaction_id` ausente → 23514 (`abastecimentos_cost_xor`): um à-vista exige ≥1 de `{transaction_id, amount_cents}`. O modelo de "sem fatura vinculada" estava errado (confundia "sem custo" com "sem fatura").
- **Fix:** fills "sem fatura" passam a ter `amount_cents` (estimativa manual) com `transaction_id` null e `parcelas_total` null; assert explícito de que nenhum fill tem fatura/parcelas antes de afirmar o km/l. "Sem fatura vinculada" = transaction_id null, não amount_cents null.
- **Files modified:** tests/abastecimento-consumo-no-double-count.test.ts
- **Commit:** ver Task Commits

## Issues Encountered
Nenhum 502 transiente de GoTrue nesta run (stack já warm). As 2 falhas da 1ª execução eram bugs reais do próprio teste (acima), não flakiness — corrigidas e verde de forma estável.

## Threat Surface
- **T-28-09 (Information Disclosure, mitigate) — COBERTO:** a suíte lê só as próprias linhas sob o `userClient` RLS-ativo; as views já são security_invoker (P26/v1.2). Nenhuma view nova, nenhum write de produção, nenhum input de cliente. Nada novo a mitigar.
- Sem novas superfícies de ameaça fora do `<threat_model>` do plano.

## Self-Check: PASSED

- Files: `tests/abastecimento-consumo-no-double-count.test.ts`, `28-05-SUMMARY.md` — FOUND.
- Test: `npm test -- tests/abastecimento-consumo-no-double-count.test.ts` → 5/5 verde contra o stack local.
- No new SQL: `grep -ci "create view\|create or replace view"` = 0.
- `npx tsc --noEmit` limpo.

---
*Phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count*
*Completed: 2026-06-22*
