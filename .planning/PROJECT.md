# Gestão Financeira Pessoal

## What This Is

Sistema web **pessoal e privado** de gestão financeira. Eu cadastro meus recebimentos, faço upload das minhas faturas e o sistema classifica os gastos automaticamente — aprendendo com cada confirmação — para mostrar o quanto estou aderente às minhas metas por categoria. Inclui reservas de oportunidade (poupança por objetivo) e uma aba para gestão do meu MEI. Single-user no v1, com modelo de dados já preparado para minha esposa entrar depois.

## Core Value

Subir uma fatura e ver os gastos classificados automaticamente — o sistema aprende cada padrão merchant→categoria a partir das minhas confirmações — junto com a aderência às minhas metas. Se tudo mais falhar, **classificação inteligente com memória + visão de metas** tem que funcionar.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(Nenhum ainda — entregar para validar)

### Active

<!-- Hipóteses até serem entregues e validadas. Detalhamento em REQUIREMENTS.md. -->

- [ ] Autenticação via meu Supabase pessoal (login só meu no v1)
- [ ] Cadastro de receitas misto: recorrentes fixos (salário, pensão) + lançamentos avulsos
- [ ] Upload de faturas em múltiplos formatos (PDF + CSV/OFX) com extração das transações
- [ ] Classificação de gastos assistida por IA: para estabelecimento novo a IA sugere categoria, eu confirmo, vira padrão salvo na memória e auto-classifica nas próximas faturas
- [ ] Categorias de gasto padrão-BR editáveis (adicionar / remover / renomear)
- [ ] Metas por categoria em % da receita, configuráveis, avaliadas mensal **e** acumulado anual, com dashboard de aderência
- [ ] Reservas de oportunidade (sinking funds) nomeadas (ex: Apê, Carro): alvo opcional com barra de progresso; entradas via gasto classificado como "Reserva" (sub-pergunta "qual reserva?") e saídas, com histórico por reserva
- [ ] Aba MEI: registro das NFs de serviço emitidas, acompanhamento do limite anual (R$ 81k) e relatório para a declaração anual (DASN-SIMEI)
- [ ] Modelo de dados escopado por `user_id` desde o v1 (multi-user-ready, sem migração dolorosa para adicionar a esposa)

### Out of Scope

<!-- Limites explícitos com motivo, para evitar re-adicionar. -->

- SaaS público / multi-tenant — é uso pessoal, não será exposto publicamente
- App mobile nativo — web app responsivo cobre o uso; nativo adiciona complexidade sem ganho no v1
- Integração bancária automática (Open Finance / scraping de banco) — ingestão é por upload manual de faturas no v1
- Conta compartilhada / família no v1 — só o modelo de dados fica pronto; a UI compartilhada vem depois
- Funções fiscais além do MEI/DASN-SIMEI — escopo fiscal limitado ao MEI

## Context

- **Projeto pessoal**, dev solo. Reaproveita infraestrutura já usada em outro projeto (GIO): mesma stack e conjunto de subagentes (`./agents/`).
- Backend é o **Supabase pessoal** do usuário: auth + Postgres + Storage (para os PDFs/arquivos de fatura).
- Dados são financeiros e sensíveis → privacidade e isolamento por usuário são requisitos de base (RLS no Supabase).
- A classificação tem duas camadas: (1) **memória de padrões** — match do descritor do estabelecimento → categoria já aprendida; (2) **IA** apenas para estabelecimento nunca visto, sempre com confirmação humana antes de virar padrão.
- MEI no Brasil: limite de faturamento R$ 81.000/ano e declaração anual DASN-SIMEI — a aba deve facilitar essa prestação de contas.
- **Versionamento**: repositório vai para o GitHub da conta `DamascenoDev` (gh CLI já autenticado). Repo remoto ainda não criado; push quando houver código.

## Constraints

- **Tech stack**: Next.js (App Router) + **TypeScript estrito, sem JavaScript** — Supabase (auth + Postgres + Storage) — deploy na Vercel
- **Privacidade**: dados financeiros pessoais — escopo por `user_id` + RLS no Supabase, sem exposição pública
- **IA**: provedor de IA para classificação a definir na pesquisa (custo/qualidade para texto curto), com confirmação humana no loop
- **Time**: dev solo, projeto pessoal — preferir caminho simples e de baixo custo operacional

## Key Decisions

<!-- Decisões que restringem trabalho futuro. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + TypeScript estrito (sem JS) + Supabase + Vercel | Web app casa com Supabase pessoal; TS estrito por preferência; reaproveita stack do GIO | — Pending |
| Classificação = memória de padrões + IA só para novos, com confirmação | Barateia (IA só no caso novo) e garante precisão via confirmação humana antes de memorizar | — Pending |
| Provedor de IA a definir na pesquisa | Comparar custo/qualidade para classificação de texto curto antes de fixar | — Pending |
| Modelo de dados escopado por `user_id` desde o v1 | Esposa entra no futuro sem migração dolorosa | — Pending |
| Metas avaliadas mensal **e** anual | Usuário quer visão de curto e longo prazo da aderência | — Pending |
| Reservas com alvo opcional + entradas/saídas | Flexível: nem toda reserva tem meta; saída permite usar o dinheiro guardado | — Pending |
| MEI completo no v1 (NF + limite R$81k + relatório DASN) | Facilitar a declaração anual é objetivo explícito | — Pending |
| PDF de fatura adiado para v1.x; OFX/CSV no v1 | PDF BR varia muito por banco e é frágil; OFX/CSV são determinísticos. PDF entra com spike sobre amostras reais | — Pending |
| Aporte em reserva conta na meta de Investimentos (alocação), não como gasto de consumo | Usuário vê reserva como investimento; deve creditar a meta de investimento, não inflar gasto | — Pending |
| Denominador das metas % = receita líquida recebida no mês | % sobre o que efetivamente caiu (recorrentes + avulsos) | — Pending |
| Metas têm direção: teto (consumo, não exceder) vs alvo (investimento/poupança, atingir) | "lazer 10%" é teto; "investimentos 20%" é alvo — aderência se mede diferente | — Pending |
| Dinheiro em centavos inteiros (bigint), nunca float | Erro de float em dinheiro é irreversível; padrão convergente da pesquisa | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-17 — Phase 7 (identidade visual e polimento: navy+gold, dark mode, data-viz, mobile, polish) complete; milestone v1.0 final phase shipped (7/7 phases).*
