# Phase 26: Substrato do abastecimento ponta-a-ponta - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Camada de dados pura (migration `~0039`+ no stack local + seed) que habilita o fluxo
"registro agora, fatura depois" e o abastecimento parcelado — substrato das fases 27
(registro rápido + parcelado) e 28 (vínculo reverso por valor). Entrega:

1. **CHECK de custo relaxado** — `abastecimentos_cost_xor` (migration `0027`) deixa de
   ser XOR estrito e passa a aceitar o estado attach-later (valor manual esperado +
   transação vinculada depois).
2. **Parcelamento** — colunas novas `parcelas_total` + `valor_total_cents` em
   `abastecimentos` + tabela de junção `abastecimento_parcelas` para o vínculo N:1
   (um parcelado → N transações ao longo dos meses).
3. **Re-link habilitado no banco/contrato** — uma transação pode ser re-vinculada a um
   abastecimento pré-existente (o `updateAbastecimento` do v1.2 marcava relink como
   out-of-scope); P26 destrava no schema/contrato, **sem** wiring de UI/action.
4. **Categoria default "Combustível"** (kind `consumo`) seedada para todos os usuários,
   no padrão `handle_new_user` + backfill idempotente do `0035`.
5. **Views de consumo atualizadas** — `v_abastecimento_consumo` / `v_carro_resumo`
   passam a contar `valor_total_cents` **uma vez** no caso parcelado (sem double-count).

**NÃO está no escopo (fica em 27/28):** botão "Novo abastecimento" na lista `/carros`,
`AbastecimentoForm` com toggle parcelado, a sugestão de vínculo por valor na grid de
importação, e o wiring do `updateAbastecimento`/`createAbastecimento` para os novos
campos. P26 é só o substrato de dados.

</domain>

<decisions>
## Implementation Decisions

### Estado attach-later (shape do CHECK relaxado)
- **D-01 (manter o esperado):** ao vincular a transação da fatura a um abastecimento que
  tinha valor manual esperado, os **dois campos coexistem** — `amount_cents` = esperado,
  `transaction_id` = real. O CHECK relaxa de XOR para **"pelo menos uma fonte de custo
  não-nula"** no caminho à-vista (probe: `NOT (transaction_id IS NULL AND amount_cents IS
  NULL)`), ou seja, ambos presentes passa a ser permitido. Motivo: casa literalmente com
  o goal "valor manual esperado **E** vínculo depois" e mantém o esperado para auditoria
  esperado-vs-real.
- **D-02 (precedência de custo):** a view de consumo já faz
  `coalesce(t.amount_cents, a.amount_cents)` → quando ambos presentes, o **real (transação)
  ganha** para o custo. Sem mudança nessa semântica. Sem double-count: `gasto_total` soma
  transações etiquetadas (`carro_id`), `consumo` faz coalesce por linha — métricas
  distintas, comportamento já existente no v1.2.

### Modelo de parcelamento (vínculo N:1)
- **D-03 (tabela de junção agora — substrato completo):** P26 cria
  `abastecimento_parcelas (abastecimento_id, transaction_id, parcela_num, …)` para o N:1
  (um parcelado → N transações). `abastecimentos.transaction_id` (índice único
  `abastecimentos_transaction_uniq`) **permanece intacto** como o link 1:1 do caso à-vista
  → zero regressão v1.2. As fases 27/28 viram só app.
- **D-04 (colunas novas):** `parcelas_total int` + `valor_total_cents bigint` em
  `abastecimentos`. **Marcador de parcelado:** `parcelas_total > 1`.
- **D-05 (cost-of-record):** parcelado → o custo do abastecimento é `valor_total_cents`
  (custo cheio do combustível, **contado uma vez** no consumo); à-vista → o existente
  `coalesce(transaction, amount_cents)`. Parcelado **nunca** usa
  `abastecimentos.transaction_id` — todos os links de parcela vão na junção. As parcelas
  confirmadas (Phase 28) etiquetam `carro_id` nas transações → o caixa se espalha pelos
  meses em `gasto_total`, sem recontar o custo de consumo.

### Categoria Combustível (seed)
- **D-06 (sort ~4, junto de Transporte):** "Combustível" (`kind consumo`) entra logo após
  "Transporte" (sort 3), empurrando Saúde→Marketplace +1, "Outros" continua último.
  Agrupamento semântico com mobilidade.
- **D-07 (padrão 0035):** re-seed do `handle_new_user()` (corpo do `0035` + 'Combustível'
  no slot novo) **+** backfill idempotente para contas existentes
  (`insert … where not exists (… name = 'Combustível')`). Data/trigger only → **sem efeito
  no `gen:types`** (igual ao `0035`).

### Escopo do substrato em P26
- **D-08 (schema + views de consumo):** P26 entrega o schema completo (colunas + tabela de
  junção + CHECK relaxado + índices + RLS/grants no padrão 0027/0035 + types regenerados)
  **E** atualiza `v_abastecimento_consumo`/`v_carro_resumo` para ler `valor_total_cents` no
  parcelado (custo uma vez). Assim o data layer fica correto no instante em que linhas
  parceladas existirem (Phase 27). Re-link = banco/contrato **permitem** (CHECK do D-01);
  o wiring do `updateAbastecimento`/`createAbastecimento` para os novos campos fica em 27/28.
- **D-09 (gen:types muda):** ao contrário do seed (D-07), a parte de schema **tem** diff de
  `database.types.ts` — nova tabela `abastecimento_parcelas` + colunas `parcelas_total`/
  `valor_total_cents`. SC5 exige a regeneração. Migrations aplicam limpas em replay no stack
  local.

### Claude's Discretion
- Nomes exatos das colunas/tabela de junção e o predicado SQL exato do CHECK relaxado
  (à-vista "≥1 fonte" + parcelado "valor_total_cents NOT NULL e transaction_id NULL") —
  desde que o comportamento das decisões acima fique preservado.
- Tipo/constraints de `parcela_num` e demais colunas auxiliares da junção (ex.: `created_at`,
  `user_id` para RLS) seguindo o padrão das tabelas do 0027/0025.
- Como exatamente a view distingue parcelado (provável `case when parcelas_total > 1 then
  valor_total_cents else coalesce(t.amount_cents, a.amount_cents) end`) — desde que sem
  double-count e com `security_invoker = true` preservado.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisito + roadmap
- `.planning/REQUIREMENTS.md` — **FUEL-01** (categoria default "Combustível" + apply-on-confirm).
  Phase 26 cobre só a metade da categoria default; o apply-on-confirm é Phase 28.
- `.planning/ROADMAP.md` § "Phase 26: Substrato do abastecimento ponta-a-ponta" — Goal +
  Success Criteria 1–5 (categoria, CHECK attach-later, colunas de parcelamento, re-link,
  replay limpo + types).

### Schema a alterar / espelhar (migrations)
- `supabase/migrations/0027_carros.sql` — **a fonte da verdade do substrato Carro.**
  `abastecimentos` (def L46–64), o CHECK `abastecimentos_cost_xor` (L60–63, **alvo do
  relaxamento**), o índice único `abastecimentos_transaction_uniq` (L67–68, **manter p/
  à-vista**), RLS/grants (L84–100), e as views `v_abastecimento_consumo` (L112–189) +
  `v_carro_resumo` (L198–240, **alvo do update p/ parcelado**). Invariantes pinados no
  topo (centavos bigint positivo, litros = volume, security_invoker obrigatório).
- `supabase/migrations/0035_categories_marketplace.sql` — **padrão exato do seed**
  (re-seed `handle_new_user()` + backfill idempotente, data/trigger only, sem gen:types).
  Espelhar para "Combustível".
- `supabase/migrations/0028_carros_fix.sql`, `0029_consumo_same_odometer_fix.sql` —
  patches posteriores das views de consumo; ler antes de mexer na view p/ não regredir.

### Contrato/código que o substrato precisa habilitar (NÃO alterar em P26)
- `src/actions/abastecimentos.ts` — `createAbastecimento` (L70) + `updateAbastecimento`
  (L149, nota explícita "relinking transactions is out of scope for v1" em L146–147). O
  re-link que P26 destrava no banco é wired aqui em 27/28.
- `src/lib/schemas/abastecimento.ts` — `abastecimentoSchema` + o `superRefine` do XOR
  (L49–60, espelha o CHECK do DB; vai precisar relaxar junto quando 27/28 wirarem, mas o
  schema **não** é alterado em P26 — só o DB/contrato).

### Pontos de pesquisa pro researcher
- **Predicado exato do CHECK relaxado** com parcelamento: à-vista (`parcelas_total` null/≤1)
  = "≥1 fonte não-nula" (permite attach-later, D-01); parcelado (`parcelas_total > 1`) =
  `valor_total_cents NOT NULL` + `transaction_id IS NULL` + `amount_cents IS NULL`.
  Confirmar que cobre todos os estados válidos sem deixar passar "custo nenhum".
- **Constraints da junção `abastecimento_parcelas`:** uma transação **não** pode ser duas
  parcelas (unique em `transaction_id` na junção) **nem** ser ao mesmo tempo um link à-vista
  (`abastecimentos.transaction_id`) e uma parcela na junção — definir como o schema previne
  o double-link. `user_id` na junção p/ RLS (padrão 0027).
- **Update da view sem double-count:** verificar `v_abastecimento_consumo` (custo do
  intervalo via `coalesce(t.amount_cents, a.amount_cents)` em L160–166) e `v_carro_resumo`
  no caso parcelado — o custo do parcelado deve vir de `valor_total_cents` uma vez, e as
  transações de parcela (etiquetadas `carro_id`) **não** devem inflar o custo de consumo.
- **Ordem de replay:** próxima migration livre é `~0039`+ (última = `0038`). Seed e schema
  podem ser uma ou duas migrations — decisão do planner.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Padrão de seed `0035`** (`handle_new_user()` re-seed + backfill idempotente,
  data/trigger only): copiar 1:1 para "Combustível" → sem diff de gen:types nessa parte.
- **Tabelas `0027` + RLS uniforme** (`own carros`/`own abastecimentos`, grants
  `authenticated, service_role`): molde direto p/ a RLS/grants da nova tabela de junção.
- **Views `security_invoker = true`** (`v_abastecimento_consumo`/`v_carro_resumo`): o
  padrão anti-leak (tests/carro-view-leak.test.ts) — manter ao reescrever a view.

### Established Patterns
- Dinheiro = centavos `bigint` SEMPRE positivo; `litros` = `numeric(7,3)` volume, nunca
  centavos (invariantes pinados no topo do `0027`).
- Migrations idempotentes (`create … if not exists`, `add column if not exists`,
  `create or replace view`).
- Cost-source enforcement em **dois lugares** (DB CHECK + Zod `superRefine`) — defense in
  depth; o schema Zod fica desalinhado de propósito até 27/28 wirarem (P26 só mexe no DB).
- `transactions.carro_id` = etiqueta aditiva não-contábil (ON DELETE SET NULL); as parcelas
  reusam esse mesmo padrão de etiqueta.

### Integration Points
- Nova migration `~0039`+ sobre `abastecimentos` (CHECK + colunas), nova tabela
  `abastecimento_parcelas`, redefinição das duas views, e o seed de "Combustível".
- `database.types.ts` regenerado (nova tabela + colunas) — `npm run gen:types` (pre-commit
  hook reescreve; ver memória dev-env). Seed isolado não toca os types.

</code_context>

<specifics>
## Specific Ideas

- Trava forte do founder em todas as decisões: **substrato completo e correto agora**
  ("ponta-a-ponta") — preferiu tabela de junção + update das views em P26 a empurrar pra 28,
  mesmo com mais SQL, pra que 27/28 sejam só app.
- O esperado manual **não se perde** no attach-later (D-01) — é dado de auditoria
  esperado-vs-real, não lixo a descartar.
- À-vista (v1.2) é **intocável**: `transaction_id` 1:1 + índice único preservados; o
  parcelado é um caminho aditivo, não um redesenho.

</specifics>

<deferred>
## Deferred Ideas

- **CAR-13** (lembrete/projeção de parcelas futuras ainda não vinculadas) — v2, reconhecido
  em REQUIREMENTS. A junção `abastecimento_parcelas` deixa o dado disponível, mas a UI de
  projeção fica fora.
- **CAR-14** (edição/relink de custo de um abastecimento já criado pela UI) — v2; P26 só
  destrava o relink no banco/contrato, o wiring de edição fica fora do milestone.
- **Alinhar o Zod `superRefine` ao CHECK relaxado + novos campos** — acontece em 27/28
  quando o `AbastecimentoForm`/actions ganharem parcelado e attach-later; não é P26.

</deferred>

---

*Phase: 26-substrato-do-abastecimento-ponta-a-ponta*
*Context gathered: 2026-06-21*
