# Phase 13: PDF de Fatura - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 13-pdf-de-fatura
**Areas discussed:** Régua de qualidade, Edições no grid, Quais linhas = transação, Escopo de emissor

---

## Régua de qualidade (best-effort)

| Option | Description | Selected |
|--------|-------------|----------|
| Só image-only bloqueia | Sem threshold numérico; extrai o que der, mostra N extraídas + J descartadas; só zero-texto (escaneado) bloqueia → mensagem CSV/OFX. Grid é a rede de segurança. | |
| Corte por cobertura | Se <X% das linhas saírem limpas, recusa o arquivo antes do grid. Precisa cravar um X arbitrário. | |
| Você decide | Critério exato definido pelo researcher após ver o resultado do spike Santander. | ✓ |

**User's choice:** Você decide.
**Notes:** Critério numérico fica com o researcher/planner pós-spike. Direção registrada no CONTEXT (D-01): único bloqueio rígido = PDF image-only/zero-texto (PDF-04); para o resto, contadores honestos (`ParseResult.dropped`) + review grid como rede; não recusar por cobertura parcial.

---

## Edições no review grid do PDF

| Option | Description | Selected |
|--------|-------------|----------|
| Editar + deletar linha | Adiciona deletar-linha ao grid (remover espúrias: saldo/total/cabeçalho). Adicionar manual fica fora. Mantém best-effort enxuto. | ✓ |
| Editar + deletar + adicionar | Grid completo, deletar E adicionar linhas perdidas. Mais UI, vira mini-editor de lançamento. | |
| Só editar (como hoje) | Reusa grid atual; problema: linhas espúrias seriam persistidas sem como limpar. | |

**User's choice:** Editar + deletar linha (D-02/D-03).
**Notes:** Deletar é o mecanismo central de limpeza do ruído inerente a PDF. Adicionar manual = fora de escopo (lançamento manual já existe em `/lançamentos`; se faltou muito, usar CSV/OFX).

---

## Quais linhas da fatura viram transação

| Option | Description | Selected |
|--------|-------------|----------|
| Compras + estornos | Compras e estornos/créditos entram (afetam gasto/metas); filtra pagamento-da-fatura, juros/encargos/IOF, saldos/totais. Parcela = valor desta fatura. Estrangeira = BRL convertido. | ✓ |
| Tudo com data+valor | Extrator "burro"; toda linha com data+valor entra, usuário deleta no grid. Mais ruído. | |
| Você decide | Heurística de filtro definida pelo researcher após ver os blocos reais do PDF Santander. | |

**User's choice:** Compras + estornos (D-04/D-05/D-06).
**Notes:** Heurística de filtro fina (como detectar débito vs. crédito, marcadores de bloco) fica como discretion do researcher pós-spike.

---

## Escopo do extrator

| Option | Description | Selected |
|--------|-------------|----------|
| Santander-first, contrato genérico | Heurística calibrada no Santander atrás do mesmo contrato ParseResult/RawTransaction; 2º emissor depois é additivo. | ✓ |
| Genérico desde já | Tenta qualquer layout; mais risco, menos precisão no Santander; contra "spike-first num banco". | |
| Só Santander | Hardcoded no layout Santander, sem extensibilidade. | |

**User's choice:** Santander-first, contrato genérico (D-07).
**Notes:** Calibragem do v1.3 é só Santander; outro banco fica additivo sem re-arquitetar.

---

## Claude's Discretion

- Critério numérico de aceite do spike (D-01).
- Heurística exata de quais blocos/linhas do PDF Santander virar transação; detecção débito vs. crédito/estorno (D-04..D-06).
- Forma de estender o dispatch de extensão (`extSchema`) para incluir `pdf`; `dedupe_key` do PDF (hash data+valor+descritor).
- **Server action vs. Route Handler Node + `maxDuration`** para o parse de PDF (D-08) — resolver contra o spike, honrando a guidance travada do PROJECT.md.
- Layout da affordance deletar-linha; exibição de contadores extraídas/descartadas; rótulo de linha em moeda estrangeira.

## Deferred Ideas

- Adicionar linha manual no review grid (usar `/lançamentos` ou CSV/OFX).
- OCR de PDF image-only/escaneado (fora do v1).
- 2º+ emissor de PDF (contrato fica genérico; calibragem additiva futura).
- Chamada LLM real `suggestCategory()` → Gemini via AI Gateway (CLS-AI, deferido desde a Fase 4).
- Fuzzy matching de descritor (v1 = match exato normalizado).
