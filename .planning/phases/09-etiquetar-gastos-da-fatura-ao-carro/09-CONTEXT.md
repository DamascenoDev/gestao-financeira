# Phase 9: Etiquetar gastos da fatura ao carro - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Liga um gasto já lançado (manutenção, óleo, etc.) a um carro via `transactions.carro_id` — lente puramente ADITIVA: o lançamento continua na mesma categoria, valor e metas (D4), reusando o padrão "qual reserva?". Cobre CAR-02. NÃO inclui agregação/visão por carro (isso é o detalhe na Phase 11) nem qualquer mudança de contabilidade. Substrato (`carro_id`, `assertOwnedCarro`) já existe da Phase 8.

</domain>

<decisions>
## Implementation Decisions

### UX de etiquetagem
- **Seletor "Carro" opcional no `transacao-form`**: grava/limpa `carro_id`, com opção "Nenhum" para desetiquetar. Livre de categoria — qualquer gasto pode ser etiquetado (não preso a uma categoria "Carro").
- **Ação de linha no `extrato-table`**: item "Vincular a carro" nas ações da linha (DropdownMenu existente) → carro picker (popover/dialog) que etiqueta um lançamento já importado; permite desvincular.
- **Etiquetar em massa**: adicionar "Vincular a carro" à `SelectionActionBar` existente (reusa o padrão de bulk-reclassify) — etiqueta vários lançamentos selecionados de uma vez.
- **Etiquetar na revisão de importação (`import-review-table`)**: seletor/ação de carro por linha durante a revisão, antes de persistir (exigido pelo success criteria #2).

### Não-destrutivo (D4 — invariante crítico)
- Etiquetar/desetiquetar NÃO altera `category_id`, `amount_cents`, `kind`, nem nenhum número de aderência às metas (mensal ou anual). Verificável comparando o dashboard antes/depois. `carro_id` é coluna aditiva nullable; nenhuma view/agg de metas lê `carro_id`.

### Segurança
- Server actions re-derivam a posse do `carro_id` com `assertOwnedCarro` (tri-state da Phase 8) antes de gravar; etiquetar com carro de outro usuário é rejeitado. Result shape `{ ok: true } | { error }`, nunca throw. Bulk valida o carro UMA vez + atualiza só transações próprias (RLS + ownership).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `transactions.carro_id` (Phase 8), `assertOwnedCarro` (`src/lib/ownership.ts`), `carros` actions/list para popular o seletor.
- `src/components/transacao-form.tsx` (o `ReservaPicker` condicional "qual reserva?" é o analog direto do seletor de carro).
- `src/components/extrato-table.tsx` (DropdownMenu de ações de linha + `rowSelection`/`SelectionActionBar` + `bulkReclassify` como analog do bulk-tag).
- `src/components/import-review-table.tsx` (linha de revisão pré-persistência).
- `src/actions/transactions.ts` (createTransaction/updateTransaction — onde `carro_id` entra; `bulkReclassify` como analog da action de bulk-tag).

### Established Patterns
- Server action: Zod → getClaims → assertOwned* → write → revalidatePath; `{ ok } | { error }`.
- "qual reserva?" picker é o padrão de seletor de entidade condicional/opcional.

### Integration Points
- `transacao-form` ganha o seletor Carro; `transactions.ts` actions aceitam/gravam `carro_id` (com ownership re-derive).
- `extrato-table` row actions + SelectionActionBar ganham "Vincular a carro"; nova action de bulk-tag (ou estende a existente).
- `import-review-table` ganha seletor de carro por linha.

</code_context>

<specifics>
## Specific Ideas

- Espelhar o "qual reserva?" para o seletor de carro (opcional, não condicionado a categoria).
- Bulk-tag reusa a mecânica de seleção/`SelectionActionBar` do bulk-reclassify.

</specifics>

<deferred>
## Deferred Ideas

- Filtro do extrato por carro + visão agregada de gasto por carro → Phase 11 (detalhe do carro).
- Abastecimento/consumo (CAR-03/04) → Phase 10.
- Aprender padrão merchant→carro / auto-sugestão → fora do v1.2 (Out of Scope).

</deferred>
