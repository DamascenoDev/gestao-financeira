# Gestão Financeira Pessoal

## What This Is

Sistema web **pessoal e privado** de gestão financeira. Eu cadastro meus recebimentos, faço upload das minhas faturas e o sistema classifica os gastos automaticamente — aprendendo com cada confirmação — para mostrar o quanto estou aderente às minhas metas por categoria. Inclui reservas de oportunidade (poupança por objetivo) e uma aba para gestão do meu MEI. Single-user no v1, com modelo de dados já preparado para minha esposa entrar depois.

## Core Value

Subir uma fatura e ver os gastos classificados automaticamente — o sistema aprende cada padrão merchant→categoria a partir das minhas confirmações — junto com a aderência às minhas metas. Se tudo mais falhar, **classificação inteligente com memória + visão de metas** tem que funcionar.

## Current State

**v1.2 "Carro" — code-complete on the LOCAL Supabase stack (2026-06-18).** O módulo de veículo está inteiro: cadastro multi-car, etiquetagem não-destrutiva de gastos da fatura ao carro, log de abastecimento híbrido (fatura OU manual, XOR) com odômetro/litros/tanque-cheio, e consumo km/l + R$/km com gráfico no detalhe. 6/6 requisitos CAR satisfeitos, integração cross-phase ship-ready (ver `milestones/v1.2-MILESTONE-AUDIT.md`).

Onze fases construídas e verificadas no stack local (v1.0 fases 1-6 = core ledger + upload/IA + MEI; v1.1 fase 7 = identidade visual; v1.2 fases 8-11 = Carro). Suíte ~735 testes, `tsc`/build limpos, auditoria de segredos exit 0.

**Não deployado.** Toda a fase remota — wiring do Supabase pessoal + deploy Vercel + verificação ao vivo no browser — está nos 6 walkthroughs `autonomous:false` diferidos (01-04, 02-05, 03-06, 04-04, 05-04, 06-05), pendentes das credenciais do usuário. Nenhuma tag git criada até o release real.

## Next Milestone Goals

A definir (`/gsd-new-milestone`). Candidatos: **(a) Deploy & shipping** — executar os 6 walkthroughs remotos, subir o app de fato e validar o core value em produção; **(b)** PDF de fatura (adiado do v1); **(c)** correção da tech-debt WR-02 (migration 0029) + qualquer feature nova.

**Design seed (v1.2, concluído):** `docs/superpowers/specs/2026-06-17-modulo-carro-design.md`. Módulo autocontido espelhando o MEI.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ **(v1.2)** Aba Carro: cadastro multi-car, etiquetagem não-destrutiva de gastos ao carro, abastecimento híbrido (XOR fatura/manual) + odômetro, consumo km/l tanque-cheio + R$/km com gráfico — **v1.2** (code-complete no stack local; CAR-01..06 6/6; validação em produção pendente do deploy)

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

> Nota: os itens Active acima (core ledger, upload/IA, MEI, reservas, metas) estão **construídos e verificados no stack local** (v1.0/v1.1, fases 1-7) mas seguem Active porque ainda não foram validados em produção — o deploy + verificação ao vivo são os 6 walkthroughs diferidos. Migram para Validated quando o app subir.

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
- **Estado de build (2026-06-18):** 11 fases construídas/verificadas no stack local (Next.js 16 + TS estrito + Supabase local, migrations 0001-0028). Suíte ~735 testes, `tsc --noEmit` + `npm run build` limpos, auditoria de segredos exit 0. Ainda **sem deploy remoto** — sem push git, sem tag.

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
| Dinheiro em centavos inteiros (bigint), nunca float | Erro de float em dinheiro é irreversível; padrão convergente da pesquisa | ✓ Good — implementado e provado por testes (local) |
| (v1.2) Etiqueta `carro_id` em transactions é lente não-destrutiva | Gasto etiquetado continua contando na categoria/metas; aba Carro só agrega, não muda contabilidade | ✓ Good — D4 provado byte-idêntico (Wave-0 integration test) |
| (v1.2) Abastecimento híbrido (vincula à fatura OU custo manual, XOR) | Combustível pago no cartão reaproveita o custo do lançamento (sem digitar/contar 2x); dinheiro/pix entra manual. Espelha reserva_ledger.transaction_id | ✓ Good — CHECK XOR no banco + validação no server; sem double-count (auditado) |
| (v1.2) Consumo pelo método tanque-cheio | Mais preciso que km/l por abastecimento isolado; requer flag tanque_cheio + odômetro | ⚠️ Revisit — funciona; edge same-odometer (WR-02) diferido p/ migration 0029 |

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
*Last updated: 2026-06-18 after v1.2 milestone — "Carro" code-complete no stack local (fases 8-11, CAR-01..06 6/6, audit ship-ready). Onze fases construídas/verificadas localmente; app ainda não deployado (6 walkthroughs remotos diferidos). Sem tag git até o release real. Próximo: `/gsd-new-milestone` (deploy/shipping é o candidato natural).*
