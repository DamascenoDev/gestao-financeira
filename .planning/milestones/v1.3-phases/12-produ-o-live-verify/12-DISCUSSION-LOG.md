# Phase 12: Produção & Live-Verify - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 12-produ-o-live-verify
**Areas discussed:** Gap da IA, Região infra, Domínio, Execução 6x

---

## Gap da IA na classificação

| Option | Description | Selected |
|--------|-------------|----------|
| Memory-only = core value v1.3 | Live-verify prova memória (aprende→auto-classifica) + metas; IA → v1.4; DEPLOY-05 reescrito p/ memória+manual; Phase 12 focada em ship | ✓ |
| Nova fase de IA neste milestone | Adiciona Phase 14 (Classificação IA) ao v1.3; atrasa o ship | |
| Construir IA dentro da Phase 12 | Dobra build de IA na fase de deploy (scope creep) | |

**User's choice:** Memory-only = core value v1.3.
**Notes:** Descoberto na scout que `suggestCategory()` é seam deferido (retorna null sempre, CLS-02 post-v1), sem AI SDK instalado. Consequência: DEPLOY-05 corrigido para memória+manual em REQUIREMENTS.md; IA registrada como CLS-AI em Future (v1.4).

---

## Região infra

| Option | Description | Selected |
|--------|-------------|----------|
| São Paulo (sa-east-1 / gru1) | Menor latência BR, dado no Brasil (LGPD), combina com America/Sao_Paulo; free tier | ✓ |
| Região default (us-east) | Mais simples, latência maior, dado fora do BR | |

**User's choice:** São Paulo (sa-east-1 / gru1).
**Notes:** —

---

## Domínio

| Option | Description | Selected |
|--------|-------------|----------|
| Subdomínio vercel.app | Grátis, zero DNS, redirect URLs triviais; troca p/ domínio próprio depois sem retrabalho | ✓ |
| Domínio próprio | Comprar + DNS + atualizar Supabase URLs; sem ganho no v1.3 | |

**User's choice:** Subdomínio vercel.app.
**Notes:** —

---

## Execução 6x (walkthroughs diferidos)

| Option | Description | Selected |
|--------|-------------|----------|
| Deploy único, verify em sequência | 0029 → wire Supabase + db push (0001-0029) → 1 deploy → roda os 6 verifies em ordem contra a URL | ✓ |
| Deploy incremental por walkthrough | Re-deploy entre walkthroughs; mais lento, mesmo bundle | |

**User's choice:** Deploy único, verify em sequência.
**Notes:** Ordem: 01-04 → 02-05 → 03-06 → 04-04 → 05-04 → 06-05. Migration 0029 antes do db push pra prod nascer com a view corrigida.

---

## Claude's Discretion

- Conteúdo técnico da migration 0029 (fix same-odometer em `v_abastecimento_consumo`).
- `supabase gen types --linked` pós-push se houver drift.

## Deferred Ideas

- Classificação por IA (CLS-AI) → v1.4.
- Domínio próprio → pós-v1.3.
- Segundo usuário (esposa) → re-ligar email confirmation + UI compartilhada.
- PDF de fatura → Phase 13 (mesmo milestone).
- 07-07 (verify visual local) → reconfirmação oportuna pós-deploy; sem requisito v1.3.
