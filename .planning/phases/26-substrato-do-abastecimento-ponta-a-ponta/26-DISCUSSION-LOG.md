# Phase 26: Substrato do abastecimento ponta-a-ponta - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 26-substrato-do-abastecimento-ponta-a-ponta
**Areas discussed:** Estado attach-later, Modelo de parcelamento, Categoria Combustível, Escopo re-link em P26

---

## Estado attach-later (shape do CHECK relaxado)

| Option | Description | Selected |
|--------|-------------|----------|
| Manter (CHECK → ≥1 fonte) | Os dois campos coexistem (amount_cents = esperado, transaction_id = real); CHECK relaxa de XOR pra "≥1 fonte não-nula"; view coalesce → real ganha pro custo; mantém esperado pra auditoria | ✓ |
| Descartar (continua XOR) | No link zera amount_cents; invariante XOR preservado, mais simples; perde o esperado | |
| Você decide | Claude escolhe seguindo o goal + mínimo risco | |

**User's choice:** Manter (CHECK → ≥1 fonte)
**Notes:** Casa literalmente com o goal "valor manual esperado E vínculo depois". Sem double-count: gasto_total soma transações etiquetadas, consumo faz coalesce por linha (comportamento já existente v1.2).

---

## Modelo de parcelamento (vínculo N:1)

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela de junção agora (completo) | colunas parcelas_total + valor_total_cents + tabela abastecimento_parcelas p/ o N:1; mantém abastecimentos.transaction_id p/ à-vista (zero regressão v1.2); 27/28 viram só app | ✓ |
| Só colunas agora (mínimo) | Só as duas colunas; mecanismo de link N:1 fica pra Phase 28 decidir+migrar | |
| FK unificada em transactions | Reverte o link p/ transactions.abastecimento_id; modelo mais limpo mas migration maior + reescreve view/actions v1.2 (mais risco) | |

**User's choice:** Tabela de junção agora (completo)
**Notes:** Founder preferiu o substrato completo "ponta-a-ponta" mesmo com mais SQL, mantendo o à-vista intocável. Cost-of-record do parcelado = valor_total_cents (contado uma vez); parcelado nunca usa abastecimentos.transaction_id.

---

## Categoria Combustível (seed)

| Option | Description | Selected |
|--------|-------------|----------|
| Junto de Transporte (sort ~4) | Slot após "Transporte" (sort 3), empurra Saúde→Marketplace +1, Outros continua último; agrupamento semântico com mobilidade | ✓ |
| Antes de Outros (sort ~12) | Slot no fim como o Marketplace foi no 0035; menos shift nos sorts existentes | |
| Você decide | Claude escolhe slot + backfill seguindo o 0035 | |

**User's choice:** Junto de Transporte (sort ~4)
**Notes:** kind consumo + backfill idempotente estilo 0035 já confirmados na pergunta. Data/trigger only → sem efeito no gen:types.

---

## Escopo do substrato em P26

| Option | Description | Selected |
|--------|-------------|----------|
| Schema + views de consumo | Schema completo (colunas + junção + CHECK + índices + RLS + types) E atualiza as views p/ ler valor_total_cents no parcelado (custo uma vez); re-link = banco/contrato permitem, wiring fica 27/28 | ✓ |
| Só schema (views em 28) | Só schema; views de consumo ficam pra Phase 28; menos risco agora mas parcelado fica com custo quebrado entre 27 e 28 | |
| Você decide | Claude escolhe o corte com mínimo risco | |

**User's choice:** Schema + views de consumo
**Notes:** Data layer correto no instante em que rows parceladas existirem (Phase 27). gen:types muda na parte de schema (nova tabela + colunas); seed isolado não toca os types.

---

## Claude's Discretion

- Nomes exatos das colunas/tabela de junção e o predicado SQL do CHECK relaxado.
- Constraints de `parcela_num` e colunas auxiliares da junção (created_at, user_id p/ RLS) seguindo o padrão 0027/0025.
- Como a view distingue parcelado (provável `case when parcelas_total > 1 …`) preservando security_invoker e sem double-count.

## Deferred Ideas

- CAR-13 (lembrete/projeção de parcelas futuras) — v2.
- CAR-14 (edição/relink de custo pela UI de um abastecimento já criado) — v2; P26 só destrava no banco/contrato.
- Alinhar o Zod `superRefine` ao CHECK relaxado + novos campos — acontece em 27/28 com o form/actions, não em P26.
