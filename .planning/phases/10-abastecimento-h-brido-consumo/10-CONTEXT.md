# Phase 10: Abastecimento híbrido + consumo - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Usuário registra abastecimentos (odômetro, litros, tanque-cheio, combustível) com custo de fonte ÚNICA (lançamento da fatura vinculado XOR valor manual — D2), e o sistema calcula consumo km/l tanque-cheio (D3) + R$/km por intervalo via as views, expondo médias por carro. Cobre CAR-03, CAR-04. A tabela `abastecimentos` + as views já existem (Phase 8); esta fase adiciona a UI de registro, o histórico, o cálculo exposto, e UMA migração de correção (`0028`). O **gráfico** rico de consumo e o detalhe completo do carro ficam na Phase 11 — esta fase mostra números + histórico.

</domain>

<decisions>
## Implementation Decisions

### Registro de abastecimento
- Registrado a partir do **detalhe do carro `/carros/[id]`** ("Novo abastecimento") — abastecimento sempre pertence a um carro.
- Form (dialog Zod + react-hook-form, padrão reserva-form/nf-form): data (default hoje SP), odômetro (int >0), litros (numeric >0), **tanque-cheio default ON**, combustível (Select; default = `combustivel_padrao` do carro se houver).
- **Toggle de fonte de custo (segmented "Da fatura" / "Manual")**:
  - "Da fatura" → picker de **lançamentos do usuário ainda não vinculados a abastecimento** (índice único parcial garante 1:1), buscáveis por descrição/valor; o custo vem de `transaction.amount_cents`. Ao vincular, o servidor **seta `carro_id` nesse lançamento** (combustível aparece no gasto do carro). NÃO grava `amount_cents` no abastecimento.
  - "Manual" → `MoneyInput` (centavos); grava `amount_cents`, `transaction_id` null.
  - Exatamente uma fonte (CHECK XOR no banco + validação no servidor); nunca ambos, nunca nenhum.
- `preco_litro` **sempre derivado** (custo ÷ litros), nunca armazenado.

### Consumo (cálculo + display)
- `v_abastecimento_consumo` (`security_invoker`) calcula km/l do intervalo tanque-cheio (Δodômetro ÷ Σlitros desde o último tanque cheio) + R$/km. `v_carro_resumo` expõe médias por carro.
- **Intervalo inválido** (odômetro recuou / erro de digitação): a **view guarda** — `km_rodados ≤ 0` → km/l nulo, excluído das médias; a UI mostra "—" no intervalo (NÃO rejeita o insert). Isto é o fix WR-05/06 diferido da Phase 8.
- Phase 10 mostra: histórico de abastecimentos (data, odômetro, litros, custo, tanque-cheio, km/l do intervalo) + médias (km/l médio, R$/km) em números no detalhe do carro. Gráfico → Phase 11.

### Migração de correção `0028` (itens diferidos da review da Phase 8)
- **WR-05/06**: corrigir `v_abastecimento_consumo` — guardar `km_rodados ≤ 0` (negativo/zero → null, fora das médias) e desempate determinístico em odômetros iguais (ex: ordenar por occurred_on, created_at).
- **WR-01**: adicionar CHECK em `carros` para `ano` (faixa sã, ex: 1900..2100 — use uma constante fixa, NÃO `now()` que deriva no virar do ano) e `combustivel_padrao` (enum Flex/Gasolina/Etanol/Diesel/GNV, nullable).
- Aplicar `0028` ao stack LOCAL (`supabase migration up`), regenerar tipos (`npm run gen:types`) sem drift. NÃO `db push` remoto, NÃO `db reset`.

### Segurança
- Servidor re-deriva posse de `carro_id` E `transaction_id` antes de cada FK write (`assertOwnedCarro` + checar que o lançamento é do usuário e não-vinculado). Result `{ ok } | { error }`, nunca throw. Dinheiro centavos inteiros; litros numeric (não dinheiro). Datas SP via `month.ts`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Tabela `abastecimentos` + views `v_abastecimento_consumo`/`v_carro_resumo` (Phase 8 migração 0027) — a UI/cálculo desta fase as consome; 0028 corrige as views.
- `assertOwnedCarro` (`ownership.ts`), `carros` actions, `tagCarro`/`carro_id` em transactions (Phase 9).
- Forms: `reserva-form.tsx`/`nf-form.tsx`/`carro-form.tsx` (dialog Zod), `MoneyInput`, `Select`, `centsToBigInt`/`formatCents`/`parseBRLToCents` (`money.ts`), `month.ts` (datas SP).
- Picker de entidade: `CarroPicker`/`ReservaPicker` como analog do picker de lançamento.
- Tabelas densas → cards mobile (Phase 7) para o histórico de abastecimentos.

### Established Patterns
- Server action: Zod → getClaims → assertOwned* → write → revalidatePath; `{ ok } | { error }`.
- Migração SQL versionada + `security_invoker` views; gen:types --local.
- `/carros/[id]` (Phase 8, detalhe mínimo) é o host do "Novo abastecimento" + histórico.

### Integration Points
- Nova migração `0028` (fix views + CHECK carros). Novo `src/lib/schemas/abastecimento.ts`, `src/actions/abastecimentos.ts`, `abastecimento-form.tsx`, picker de lançamento, histórico no `/carros/[id]`, libs de apresentação de consumo (`src/lib/carro/consumo.ts`).

</code_context>

<specifics>
## Specific Ideas

- Vínculo abastecimento→lançamento espelha `reserva_ledger.transaction_id` (Phase 8 spec D2).
- Display de consumo reusa os helpers de número/mono `tabular-nums` da Phase 7.

</specifics>

<deferred>
## Deferred Ideas

- Gráfico de consumo (km/l no tempo) + detalhe rico do carro (KPIs, gasto por categoria) → Phase 11 (CAR-05).
- OCR de nota de abastecimento, lembretes de manutenção → fora do v1.2 (Out of Scope).

</deferred>
