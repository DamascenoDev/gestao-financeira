# Módulo "Carro" — Design Spec

**Data:** 2026-06-17
**Status:** Aprovado (design) — pronto para roteamento GSD
**Autor:** brainstorming colaborativo (usuário + Claude)
**Roteamento alvo:** novo milestone **v1.1 — Carro** (v1.0 com fases concluídas)

---

## Visão geral

Aba "Carro" para gestão de veículo(s) pessoal(is) dentro do app de gestão financeira:

1. **Cadastrar carro(s)** — registro do veículo.
2. **Vincular gastos da fatura ao carro** — etiquetar lançamentos importados (manutenção, troca de óleo, etc.) a um carro, para ver o gasto total por veículo.
3. **Registrar abastecimentos + quilometragem** — log de abastecimento com odômetro e litros para calcular médias de consumo (km/l) e custo por km.

Módulo **autocontido**, espelhando a estrutura do módulo MEI. Re-skin/identidade da fase 7 já se aplica (navy+gold, dark mode, charts).

---

## Decisões travadas (do brainstorming)

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Quantos carros | **Vários** — tabela `carros` (cadastra 1 agora, suporta N; multi-user-ready como o resto do app) |
| D2 | Abastecimento × fatura | **Híbrido** — abastecimento é registro próprio que PODE vincular a um lançamento da fatura (custo reaproveitado, sem digitar/contar 2x) OU ter custo manual (dinheiro/pix) |
| D3 | Cálculo de consumo | **Tanque cheio** — flag `tanque_cheio` + odômetro por abastecimento; km/l do intervalo = Δodômetro ÷ Σlitros desde o último tanque cheio |
| D4 | Etiquetar gasto vs metas | **Lente não-destrutiva** — `carro_id` é etiqueta adicional; o lançamento continua contando na categoria/metas dele; a aba Carro não muda contabilidade nem orçamento |
| D5 | Escopo v1 | **Completo com gráfico** — cadastro + etiquetar fatura + log de abastecimento + consumo (km/l, R$/km) + gráfico de consumo no detalhe (infra recharts da fase 7) |

---

## Modelo de dados

Migração nova (ex: `00XX_carros.sql`), seguindo o padrão uniforme do repo (RLS `auth.uid()=user_id`, grants authenticated/service_role, índice por `user_id`, money em centavos inteiros positivos).

### Tabela `carros`
```
id                 uuid PK default gen_random_uuid()
user_id            uuid NOT NULL → auth.users(id) ON DELETE CASCADE
apelido            text NOT NULL                 -- nome amigável para a lista/seletor
modelo             text                          -- opcional
placa              text                          -- opcional
ano                int                           -- opcional
combustivel_padrao text                          -- opcional (gasolina/etanol/diesel/flex/GNV)
is_archived        boolean NOT NULL default false
created_at         timestamptz NOT NULL default now()
```

### `transactions` — coluna nova (etiqueta opcional)
```
+ carro_id uuid → carros(id) ON DELETE SET NULL
```
- Nullable. Não muda nenhuma contabilidade existente (D4). `ON DELETE SET NULL`: apagar o carro não apaga lançamentos, só desvincula.
- Ownership de `carro_id` re-derivado no server antes de cada write (padrão `assertOwned*` / IDOR safety).

### Tabela `abastecimentos`
```
id                uuid PK default gen_random_uuid()
user_id           uuid NOT NULL → auth.users(id) ON DELETE CASCADE
carro_id          uuid NOT NULL → carros(id) ON DELETE CASCADE
occurred_on       date NOT NULL                 -- pinned America/Sao_Paulo
odometro_km       int NOT NULL CHECK (odometro_km > 0)
litros            numeric(7,3) NOT NULL CHECK (litros > 0)
tanque_cheio      boolean NOT NULL              -- método tanque-cheio (D3)
combustivel       text                          -- tipo abastecido
transaction_id    uuid → transactions(id) ON DELETE SET NULL   -- vínculo opcional (D2)
amount_cents      bigint CHECK (amount_cents IS NULL OR amount_cents > 0)  -- custo manual quando SEM vínculo
note              text
created_at        timestamptz NOT NULL default now()
```

**Regra de custo (CHECK + validação no server):** o custo vem de `transaction_id` **OU** de `amount_cents` manual — exatamente uma fonte:
```
CHECK ( (transaction_id IS NOT NULL AND amount_cents IS NULL)
     OR (transaction_id IS NULL     AND amount_cents IS NOT NULL) )
```
- `preco_litro` é **derivado** (custo ÷ litros), nunca armazenado.
- Índice único parcial em `transaction_id` (where not null) — um lançamento vincula a no máximo um abastecimento.
- Ao vincular, o server também seta `carro_id` no `transactions` vinculado (combustível aparece no gasto do carro).

---

## Lógica de consumo

### View `v_abastecimento_consumo` (security_invoker = true)
Por carro, ordenado por `odometro_km`, usando window `lag()`:
- intervalo = do último abastecimento com `tanque_cheio=true` até o atual tanque-cheio;
- `km_rodados` = odômetro atual − odômetro do último tanque cheio;
- `litros_intervalo` = Σ litros dos abastecimentos no intervalo;
- `km_por_litro` = km_rodados ÷ litros_intervalo;
- `custo_intervalo_cents` = Σ custo (do `transaction.amount_cents` quando vinculado, senão `abastecimentos.amount_cents`);
- `reais_por_km` = custo_intervalo ÷ km_rodados.

### View `v_carro_resumo` (security_invoker = true)
Por carro: km/l médio (média móvel dos intervalos tanque-cheio), R$/km médio, preço médio/litro, gasto total no carro (Σ `transactions.amount_cents` where `carro_id`), gasto/mês corrente.

Todo dinheiro: helpers `centsToBigInt`/`formatCents` (`src/lib/money.ts`). Toda data: helpers SP de `src/lib/month.ts`. Custo no banco sempre centavos inteiros; litros como numeric (não é dinheiro).

---

## Seam de etiquetagem (reusa o padrão "qual reserva?")

- **`transacao-form`**: seletor opcional "Carro" → grava `carro_id`. Livre — qualquer gasto pode ser do carro, não preso a categoria.
- **`extrato-table`** (e import-review): ação de linha "vincular a carro" para etiquetar lançamentos já importados da fatura.
- Server actions re-derivam ownership do `carro_id` antes do write; result shape `{ ok: true } | { error }`, nunca throw.

---

## UI / rotas (espelha módulo MEI)

- `NAV_ITEMS` += `{ href: '/carros', label: 'Carros', icon: Car }` em `app-sidebar.tsx` **e** `bottom-nav.tsx`.
- `/carros` — lista de carros (apelido, gasto total, km/l médio, badge se arquivado).
- `/carros/[id]` — detalhe:
  - cabeçalho do carro (apelido/modelo/placa/ano);
  - KPIs: km/l médio, R$/km, gasto total (manutenção + combustível);
  - gasto por categoria (lançamentos com este `carro_id`);
  - histórico de abastecimentos (`abastecimento-table` — data, odômetro, litros, R$, km/l do intervalo, vínculo à fatura);
  - **gráfico de consumo** (recharts via shadcn chart — km/l ao longo do tempo);
  - empty/loading/error states no padrão da fase 7.
- Forms Zod + react-hook-form: `carro-form`, `abastecimento-form` (com seletor opcional de lançamento da fatura para o vínculo D2).
- `src/lib/schemas/carro.ts`, `src/actions/carros.ts`, `src/actions/abastecimentos.ts` (ou agrupado), `src/lib/carro/consumo.ts` (apresentação dos cálculos).

---

## Requisitos / critérios de aceite

- **CAR-01** Usuário cadastra, edita, arquiva carro(s); lista mostra todos os carros não-arquivados.
- **CAR-02** Usuário etiqueta um lançamento da fatura a um carro (`carro_id`) via form e via ação no extrato; etiquetar NÃO altera categoria/metas do lançamento (D4).
- **CAR-03** Usuário registra abastecimento (data, odômetro, litros, tanque cheio?, combustível) com custo vindo de um lançamento vinculado OU manual — nunca ambos, nunca nenhum (CHECK).
- **CAR-04** Sistema calcula km/l pelo método tanque-cheio e R$/km por intervalo, e médias por carro.
- **CAR-05** Detalhe do carro mostra gasto total (manutenção + combustível), histórico de abastecimentos e gráfico de consumo (km/l no tempo).
- **CAR-06** Aba "Carros" na sidebar e bottom-nav; rotas sob `/carros`.
- **SEC/PRIV** Todas as tabelas com RLS `auth.uid()=user_id`; views `security_invoker=true`; ownership de `carro_id`/`transaction_id` re-derivado antes de cada FK write; nenhum dado novo exposto além do tier de apresentação.

---

## Fora de escopo (v1.1)

- Lembretes/alertas de manutenção (revisão por km/data) — futuro.
- Multi-usuário compartilhando o mesmo carro — só o modelo fica pronto (user_id-scoped), UI compartilhada fora de escopo (igual ao resto do app).
- OCR/parse de nota de abastecimento — entrada manual no v1.
- Categoria "Carro" dedicada/auto-classificação merchant→carro — etiquetagem é manual/explícita no v1.
- Depreciação, seguro, IPVA como módulo fiscal — não no v1.

---

## Roteamento GSD

v1.0 teve suas 7 fases executadas (fase 7 = re-skin, última). Este é um conjunto coeso novo →
**novo milestone v1.1 "Carro"**, construído como MVP vertical (mesmo modo `mvp` das fases anteriores):
substrato/schema → CRUD de carro + seam de etiquetagem → log de abastecimento + consumo → polish + gráfico.

Próximo passo: `/gsd-new-milestone` usando este spec como semente (PROJECT.md → REQUIREMENTS.md → ROADMAP),
depois discuss → plan → execute por fase.
