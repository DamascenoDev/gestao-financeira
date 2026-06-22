# Phase 28: Vínculo reverso por valor + consumo sem double-count - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Camada de **aplicação** que fecha a cadeia ponta-a-ponta do v1.7 (P26 substrato + P27
registro). Quando a fatura chega, o sistema casa **por valor** um lançamento com um
abastecimento pré-registrado e sugere o vínculo na grid de revisão de importação
(`src/components/import-review-table.tsx`), espelhando o padrão de sugestão/confirmação da
classificação por IA — **sem auto-commit**. Ao confirmar, o lançamento fica vinculado ao
abastecimento, o `carro_id` é etiquetado no lançamento e a categoria **"Combustível"** é
aplicada. Um parcelado casa **uma parcela por fatura** ao longo dos meses, sem recontar o
custo; as views de consumo (já prontas na P26) refletem manuais + vinculados sem
double-count. Entrega CAR-09, CAR-10, CAR-11, CAR-12 (+ apply-on-confirm de FUEL-01).

**Arquitetura é ADITIVA sobre seams que já existem** — sem novo schema (a junção
`abastecimento_parcelas`, o CHECK relaxado e as views são da P26):
- **Pass de match** novo em `ingestStatement`, espelhando o pass de sugestão da IA
  (memória→keyword→IA→**match de abastecimento**); anexa uma sugestão NÃO-vinculante na
  `ParsedReviewRow`, igual ao `row.suggestion` da IA.
- **Grid** reusa a coluna **Carro** (CAR-02, `InlineReviewCarroCell` + `tagCarroRow`) como
  ponto de ancoragem da sugestão de vínculo.
- **`confirmImport`** já persiste `carro_id` por linha (CAR-02) e já tem `insertedByKey`
  (dedupe_key → novo tx id) + o re-derive de posse de `carro_id` — é o seam exato para
  gravar o vínculo após o insert da tx.

**NÃO está no escopo (out-of-scope no REQUIREMENTS / fica em v2):**
- Match automático sem confirmação (filosofia human-in-the-loop, sem auto-commit).
- Match por descrição/merchant do lançamento (v1.7 casa **só por valor**).
- OCR de cupom/nota de posto.
- **Nova tela/relatório de consumo** — as views km/l + R$/km já existem (v1.2) e já foram
  atualizadas na P26; P28 só as ALIMENTA com as linhas vinculadas.
- Botão de abastecimento no Extrato (decisão do founder — acesso rápido só na lista `/carros`).
- CAR-13 (projeção de parcelas futuras não vinculadas) e CAR-14 (edição/relink de custo de
  abastecimento já criado pela UI) — v2.

</domain>

<decisions>
## Implementation Decisions

### D1 — Predicado do match por valor (CAR-09)
- **D-01 (conjunto exato, sem janela arbitrária):** parcela casa quando
  `valor_lançamento ∈ {floor(valor_total_cents ÷ N), ceil(valor_total_cents ÷ N)}` em
  centavos (N = `parcelas_total`); à-vista casa `valor_lançamento == amount_cents` exato.
  Determinístico, sem tolerância de centavos arbitrária — cobre o split padrão de cartão
  (resto na última parcela: 100,00÷3 = 33,34 + 33,33 + 33,33, todos ∈ {33, 34} cents do
  par floor/ceil de 3333,33). Alinhado à trava "correto e simples" da P26.
- **D-02 (candidatos só por valor, data não trava):** os candidatos do match são os
  abastecimentos **não-vinculados** do usuário que casam pelo predicado D-01 — **sem filtro
  de data**. Motivo: parcelado chega ao longo de MESES; uma janela de data quebraria as
  parcelas tardias. A data do abastecimento entra **só como desempate** (D-03), nunca como
  filtro de elegibilidade.

### D2 — Desambiguação + uma parcela por fatura (CAR-10, CAR-11)
- **D-03 (uma sugestão por linha — mais próximo por data):** quando >1 abastecimento
  não-vinculado casa o valor de um lançamento, sugerir **UM** — o de `occurred_on` mais
  próximo do lançamento; empate → o mais antigo não-vinculado (FIFO). Mantém 1 sugestão/linha,
  espelhando a sugestão única da IA; o usuário descarta se errado.
- **D-04 (atribuição 1:1 greedy no pass de match — CAR-11 estrutural):** cada abastecimento
  candidato é "consumido" por **no máx uma linha** da importação (a melhor linha leva; as
  demais que casariam o mesmo abastecimento ficam sem sugestão). Para parcelado, o pass conta
  **parcelas já na junção** `abastecimento_parcelas` + **as já atribuídas nesta fatura** →
  **≤ 1 parcela nova por fatura**, e para de sugerir quando as N parcelas estão completas.
  A invariante "uma parcela por fatura, sem duplo-link" nasce no match, não só na validação.

### D3 — Surfacing na grid + categoria Combustível (CAR-10, FUEL-01)
- **D-05 (ancorar na coluna Carro existente):** a célula de **Carro** (`InlineReviewCarroCell`,
  CAR-02) vira o ponto da sugestão de vínculo: mostra o carro sugerido + affordance
  **confirmar/descartar** (espelha o `SuggestionSlot` da IA, mas na coluna Carro). Confirmar
  seta `carro_id` (que a célula já faz via `tagCarroRow`) **+** marca o vínculo de
  abastecimento na linha **+** aplica "Combustível" na coluna Categoria. Sem 3ª coluna numa
  grid já densa.
- **D-06 (Combustível sempre, sobrescreve):** confirmar o vínculo **pré-preenche** a célula de
  Categoria com "Combustível", **sobrescrevendo** sugestão da IA E classificação por
  memória/palavra-chave. O vínculo é ação explícita do usuário > auto-classificação. Como toda
  a grid é sem auto-commit, "aplicar" = setar `category_id` no estado cliente; **continua
  editável** até o "Confirmar importação" final.
- **D-07 (por-linha + "Vincular todos"):** confirmar/descartar por linha **E** um botão de
  lote que vincula todas as sugestões de uma vez (espelha `applyAllSuggestions` da IA). O
  match é 1:1 exato por valor (alta precisão), então o lote é seguro.

### D4 — Gravação do vínculo (CAR-10, CAR-11)
- **D-08 (estender o `confirmImport`):** após inserir as transações, no mesmo fluxo:
  à-vista → `update abastecimentos.transaction_id`; parcelado → `insert abastecimento_parcelas`
  (com `parcela_num`). Reusa `insertedByKey` + o re-derive de posse já existente. O cliente
  passa `abastecimentoId` (+ kind/parcela) no payload da linha; o servidor **re-deriva posse
  do `abastecimentoId`** como já faz com `carro_id` (IDOR — FKs não são RLS-aware).
- **D-09 (vincular também a tx dedupe-skipped):** uma linha cuja tx já existe (dedupe-skip, não
  entra no `insertedByKey`) mas com vínculo confirmado **vincula mesmo assim** — buscar o tx id
  existente por `dedupe_key` e gravar o vínculo nela. Cobre "a parcela foi importada solta
  antes e agora quero vinculá-la". Os índices únicos (`abastecimentos_transaction_uniq` +
  o unique da junção) impedem duplo-link; evita falha silenciosa de um vínculo confirmado.

### Carry-forward (TRAVADO em fases anteriores — NÃO re-discutir)
- **Sem auto-commit / human-in-the-loop** — vínculo é sugestão; o usuário confirma
  (filosofia do projeto + REQUIREMENTS Out of Scope).
- **Match só por VALOR** — sem matching por descrição/merchant (REQUIREMENTS Out of Scope).
- **Attach-later à-vista mantém o `amount_cents` esperado** ao setar `transaction_id` — os
  dois coexistem (auditoria esperado-vs-real); a view faz `coalesce(t.amount_cents,
  a.amount_cents)` → o real ganha pro custo (P26 D-01/D-02). NÃO limpar `amount_cents`.
- **Parcelado: custo = `valor_total_cents` contado UMA vez** no consumo; as parcelas
  confirmadas só etiquetam `carro_id` nas transações → o caixa se espalha por `gasto_total`
  ao longo dos meses, sem recontar o custo (P26 D-05). Sem double-count.
- **Views de consumo já prontas (P26 D-08):** `v_abastecimento_consumo` / `v_carro_resumo`
  já leem `valor_total_cents` no parcelado e fazem coalesce no à-vista; **km/l = só litros +
  odômetro** (não exige a fatura). CAR-12 é majoritariamente **verificação** + alimentar as
  views com as linhas vinculadas — sem SQL novo de relatório.

### Claude's Discretion
- **Shape exato da sugestão de match** na `ParsedReviewRow` (ex.: `abastecimentoMatch?:
  { abastecimentoId, kind: 'avista' | 'parcela', parcelaNum?, carroId, carroApelido, … }`),
  espelhando o `suggestion?` da IA (parsers/types.ts L89). E a extensão correspondente do
  `ReviewRow` + `InlineReviewCarroCell` na grid.
- **Funções do pass de match** em `ingestStatement` (fetch dos abastecimentos não-vinculados +
  índice por valor-alvo + atribuição greedy 1:1 D-04), batched (nunca per-row — anti-padrão
  WR-02), espelhando o batched `categoryList`/`keywordRules`/`dupSet`.
- **Helper de posse `assertOwnedAbastecimento`** (ou reuso de probe owner-scoped) para o IDOR
  re-derive do `abastecimentoId` no `confirmImport`, espelhando `assertOwnedCarro` tri-state.
- **Atribuição de `parcela_num`** (count das parcelas já na junção + 1) e o payload do insert
  da junção (`user_id`, `abastecimento_id`, `transaction_id`, `parcela_num`) conforme o schema
  do `0039`.
- **Semântica de falha parcial** se o write do vínculo falhar APÓS o insert da tx — espelhar o
  padrão já existente do `confirmImport` (a tx já landou; surfacing-but-keep com mensagem, como
  a falha de aprendizado da memória) vs. outra estratégia.
- **Lookup do tx existente por `dedupe_key`** para o caso dedupe-skipped (D-09) — batched.
- **Se o à-vista re-link reusa internamente o caminho do `updateAbastecimento`** ou um update
  estreito (só `transaction_id` + carro_id sync) dentro do `confirmImport`.
- **Design visual** do affordance no célula de Carro + do botão "Vincular todos" (UI hint: yes).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisito + roadmap
- `.planning/REQUIREMENTS.md` — **CAR-09** (sugestão de vínculo por valor), **CAR-10**
  (confirmar/descartar na grid sem auto-commit + carro_id), **CAR-11** (uma parcela/fatura sem
  recontar custo), **CAR-12** (consumo reflete manuais + vinculados; km/l só litros+odômetro),
  **FUEL-01** (apply-on-confirm de "Combustível"). Também a seção "Out of Scope".
- `.planning/ROADMAP.md` § "Phase 28: Vínculo reverso por valor + consumo sem double-count" —
  Goal + Success Criteria 1–4.

### Substrato pronto das fases 26/27 (a base que esta fase apenas WIRA)
- `.planning/phases/26-substrato-do-abastecimento-ponta-a-ponta/26-CONTEXT.md` — D-01
  (attach-later, ambos coexistem), D-02 (coalesce/precedência de custo, sem double-count),
  D-03 (junção `abastecimento_parcelas` N:1), D-05 (cost-of-record parcelado), D-08 (views já
  atualizadas).
- `.planning/phases/27-registro-r-pido-abastecimento-parcelado/27-CONTEXT.md` — o parcelado
  nasce **sem** `abastecimento_parcelas`; o preview "valor por parcela" (~total/N) antecipa o
  valor que P28 casa; à-vista manual = `amount_cents` set + `transaction_id` null.
- `supabase/migrations/0039_abastecimento_parcelado.sql` — **fonte da verdade:** colunas
  `parcelas_total` + `valor_total_cents`; CHECK relaxado `abastecimentos_cost_xor`; junção
  `abastecimento_parcelas` (a tabela que P28 finalmente popula); view de consumo
  parcelado-aware.
- `supabase/migrations/0040_categorias_combustivel.sql` — categoria default "Combustível"
  (`kind consumo`) que o apply-on-confirm aplica (FUEL-01).
- `supabase/migrations/0027_carros.sql` — `abastecimentos`, o índice único
  `abastecimentos_transaction_uniq` (1:1 à-vista, anti-duplo-link), as views
  `v_abastecimento_consumo` / `v_carro_resumo` (CAR-12).

### Código a alterar (o wiring desta fase)
- `src/actions/import.ts` — **o coração da fase.** `ingestStatement` (pass de match novo,
  espelhando o pass da IA L478-558 e o batched fetch L422-476); `confirmImport` (gravar o
  vínculo após o insert: `insertedByKey` L914-926, o IDOR re-derive de `carro_id` L728-746 a
  espelhar para `abastecimentoId`, o `carro_id` persistido L901-904).
- `src/actions/abastecimentos.ts` — padrão de attach + carro_id sync (`assertOwnedTransaction`,
  o 1:1 pre-check L131-140, o carro_id sync L158-166) a reusar/espelhar para o à-vista re-link.
- `src/components/import-review-table.tsx` — `InlineReviewCarroCell` + coluna "Carro"
  (L652-659, `tagCarroRow` L496-500), o `SuggestionSlot` da IA, `applyAllSuggestions`
  (L466-490), o tipo `ReviewRow` (L253 `carro_id`, L279 `suggestion`).
- `src/lib/parsers/types.ts` — `ParsedReviewRow` ganha o campo de sugestão de match (espelhar
  `suggestion?` L89).
- `src/lib/schemas/import.ts` — `confirmImportRowSchema` (ganha os campos do vínculo:
  `abastecimentoId` + kind/parcela) e o `CsvMapping`/tipos do payload.
- `src/app/(app)/importar/[statementId]/page.tsx` — RSC da revisão: já busca `carros`
  (L181-186); precisa também buscar os **abastecimentos não-vinculados** (candidatos) — ou o
  match já vem resolvido do `ingestStatement` persistido em `parsed_rows` (preferível, mantém
  o servidor como fonte da verdade do match, igual à IA).

### Padrões de referência (espelhar)
- `src/components/suggestion-slot.tsx` — o affordance confirmar/descartar da IA a espelhar.
- `src/lib/carro/consumo.ts` + as views de consumo — para a verificação de CAR-12 (km/l só
  litros+odômetro; custo parcelado uma vez).
- `src/lib/money.ts` — `parseBRLToCents` / `formatCents` (predicado D-01 em centavos + display).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Pass de classificação batched em `ingestStatement`** (import.ts L422-558): o molde exato do
  pass de match — pré-fetch ONCE (categories/keywords/dupSet) + loop sem query per-row + anexa
  sugestão não-vinculante. O match de abastecimento vira mais uma camada/pass no mesmo padrão.
- **`InlineReviewCarroCell` + `tagCarroRow`** (import-review-table.tsx): a coluna Carro já
  setea `carro_id` no estado cliente sem auto-commit — base direta do affordance de vínculo.
- **`SuggestionSlot` + `applyAllSuggestions`**: o padrão confirmar/descartar por-linha + batch
  que o vínculo espelha (por-linha + "Vincular todos", D-07).
- **`confirmImport` `insertedByKey` + IDOR de `carro_id`**: o seam que já tem o novo tx id E o
  re-derive de posse — a gravação do vínculo (D-08) encaixa logo após o insert da tx.
- **`assertOwnedCarro` / `assertOwnedTransaction` tri-state**: molde do `assertOwnedAbastecimento`.

### Established Patterns
- **Sem auto-commit**: sugestão (IA, agora vínculo) NUNCA escreve em `category_id`/`carro_id` no
  parse; só vira estado cliente na confirmação; só `confirmImport` persiste.
- **WR-01 (não confiar no cliente)**: `confirmImport` re-lê os `parsed_rows` persistidos por
  `dedupe_key`; o payload do cliente contribui só a ESCOLHA (categoria/reserva/carro/agora
  vínculo). O `abastecimentoId` precisa de re-derive de posse server-side (FKs não são RLS-aware).
- **WR-02 (batched, nunca per-row)**: todo fetch do pass de match e o lookup por `dedupe_key`
  (D-09) em UMA query `.in(...)`.
- **Defense-in-depth de duplo-link**: pre-check + índice único (à-vista `abastecimentos.
  transaction_id`; parcela = unique da junção) — o pass greedy D-04 evita gerar a sugestão; o
  índice é o backstop no insert.
- **Dinheiro = centavos `bigint` positivo**: o predicado D-01 é aritmética inteira (floor/ceil
  da divisão), nunca float.

### Integration Points
- `ingestStatement` ← novo pass de match (fetch abastecimentos não-vinculados + greedy 1:1) →
  anexa sugestão na `ParsedReviewRow` persistida em `statements.parsed_rows`.
- `import-review-table` ← célula de Carro estendida (sugestão de vínculo) + botão "Vincular
  todos" + aplicar "Combustível" na confirmação.
- `confirmImport` ← após insert da tx: à-vista `update transaction_id`; parcelado `insert
  abastecimento_parcelas`; IDOR re-derive do `abastecimentoId`; lookup por `dedupe_key` p/
  dedupe-skip.
- Sem migration nova — `abastecimento_parcelas`, CHECK e views são da P26; `database.types.ts`
  já tem a tabela + colunas.

</code_context>

<specifics>
## Specific Ideas

- O founder enquadra o vínculo como **ação explícita forte**: por isso ele **sobrescreve** a
  auto-classificação (IA/memória/keyword) com "Combustível" (D-06) — confirmar o vínculo é o
  usuário dizendo "isto é este abastecimento", sinal mais forte que qualquer palpite.
- Preferência por **determinismo sobre fuzzy**: o match por conjunto exato `{floor,ceil}`
  (D-01) em vez de janela de centavos arbitrária — coerente com a trava "correto e simples" da
  P26 (substrato completo agora pra 27/28 serem só app).
- **CAR-11 deve ser estrutural, não só validado**: a atribuição greedy 1:1 no pass de match
  (D-04) garante "uma parcela por fatura" no momento da sugestão, com o índice único da junção
  como backstop — não confiar só numa checagem no confirm.
- **Não perder vínculo silenciosamente**: vincular a tx dedupe-skipped (D-09) cobre o caso real
  de uma parcela importada solta antes do registro do abastecimento.

</specifics>

<deferred>
## Deferred Ideas

- **CAR-13** (lembrete/projeção de parcelas futuras de um parcelado ainda não totalmente
  vinculadas — quantas faltam casar) — v2. A junção deixa o dado disponível; a UI de projeção
  fica fora.
- **CAR-14** (edição/relink de custo de um abastecimento já criado pela UI) — v2; a nota
  "relinking out of scope" segue em `updateAbastecimento`.
- **Match por descrição/merchant** do lançamento de combustível — out of scope (v1.7 casa só
  por valor; matching textual fica para depois se necessário).
- **OCR de cupom/nota de posto** — out of scope (mesmo motivo do no-OCR de PDF).
- **Nova tela/relatório de consumo** — out of scope; km/l + R$/km já existem (v1.2) e as views
  já foram alimentadas na P26; P28 só cria as linhas vinculadas.
- **Botão de abastecimento no Extrato** — out of scope por decisão do founder (acesso rápido só
  na lista `/carros`).
- **Janela de data como filtro de elegibilidade do match** — rejeitado (D-02): parcelado chega
  ao longo de meses; data só desempata (D-03).

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count*
*Context gathered: 2026-06-22*
