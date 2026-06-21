# Phase 25: Fix de scroll na criação de palavra-chave - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 25-fix-de-scroll-na-cria-o-de-palavra-chave
**Areas discussed:** Mecanismo do fix, Re-classificar grid, Verificação

---

## Mecanismo do fix

### Q1 — Como escopar o revalidatePath para o path inline parar de resetar o scroll?

| Option | Description | Selected |
|--------|-------------|----------|
| Param com default | 3º arg opcional em addKeyword, default = revalidar; inline opta por pular | |
| Action inline separada | Novo server action idêntico menos o revalidate | ✓ |
| Remover revalidate + refresh no caller | Tirar revalidate de addKeyword; /categorias dá router.refresh() | |

**User's choice:** Action inline separada
**Notes:** Founder preferiu não tocar o contrato compartilhado nem o path `/categorias`. Flag dada: leve tensão com a decisão KW-07 ("reusa addKeyword verbatim, sem novo server action") — resolvida pelo helper compartilhado abaixo.

### Q2 — Como evitar duplicar validação/normalização entre addKeyword e a nova action inline?

| Option | Description | Selected |
|--------|-------------|----------|
| Helper privado compartilhado | Extrair core (4 guards + normalize + dup-check + insert) num helper; dois wrappers finos | ✓ |
| Duplicar o corpo | Copiar as guards na nova action | |
| Você decide | Planner escolhe a estrutura interna | |

**User's choice:** Helper privado compartilhado
**Notes:** addKeyword = helper + revalidate; addKeywordInline = helper sem revalidate. Mesma union AddKeywordResult pro branching do popover seguir igual.

---

## Re-classificar grid

### Q1 — Depois de criar a keyword inline, o que a grid faz com as outras linhas?

| Option | Description | Selected |
|--------|-------------|----------|
| Só marca esta linha (mínimo/atual) | Flipa só esta linha pra 'criada ✓', sem re-classify; vale no próximo upload | |
| Re-aplicar na grid agora | Re-rodar matcher ao vivo nas outras linhas | ✓ |

**User's choice:** Re-aplicar na grid agora
**Notes:** ⚠ Scope-creep flag dado — re-classify ao vivo vai além do SC do UX-01. Confirmado na Q seguinte.

### Q2 (scope) — Re-aplicar ao vivo é nova capacidade. Como prosseguir?

| Option | Description | Selected |
|--------|-------------|----------|
| Defer — P25 só o scroll | Manter P25 estrito; registrar re-classify como Deferred Idea | |
| Expandir P25 agora | Incluir re-classify ao vivo no P25 | ✓ |

**User's choice:** Expandir P25 agora
**Notes:** Founder optou por expandir o escopo deliberadamente. CONTEXT.md sinaliza que ROADMAP/REQUIREMENTS precisam refletir o comportamento novo.

### Q3 — Quais linhas a nova keyword re-classifica ao vivo?

| Option | Description | Selected |
|--------|-------------|----------|
| Só não-classificadas | Só category_id === null; nunca toca classificadas | |
| Não-class. + auto (IA/memória) | Aplica em null E sobrescreve auto; preserva manual | ✓ |
| Você decide | Planner decide; trava: nunca sobrescrever manual | |

**User's choice:** Não-classificadas + auto (IA/memória), preservando manual
**Notes:** Linhas novas ganham provenance 'palavra-chave'. Ponto de pesquisa registrado: sobrescrever linha de memória inverte a precedência normal memória→palavra-chave→IA.

---

## Verificação

### Q1 — Como verificar o P25 (scroll + persistência + re-classify ao vivo)?

| Option | Description | Selected |
|--------|-------------|----------|
| Unit + UAT vivo | vitest (no-revalidate + re-classify + preserva manual) + Chrome MCP no scroll real | ✓ |
| Só unit | vitest apenas; scroll real só inferido | |
| Você decide | Planner define; trava mínima de cobertura | |

**User's choice:** Unit + UAT vivo (padrão do repo)
**Notes:** —

---

## Claude's Discretion

- Nome exato da action inline + assinatura do helper privado (guards devem ficar bit-idênticas ao addKeyword atual).
- Confidence/score das linhas re-classificadas pela keyword.

## Deferred Ideas

Nenhuma — a re-classificação ao vivo da grid (candidata natural a fase própria) foi explicitamente puxada pro escopo do P25 pelo founder.
