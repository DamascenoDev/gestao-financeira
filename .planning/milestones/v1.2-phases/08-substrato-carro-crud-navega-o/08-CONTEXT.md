# Phase 8: Substrato Carro + CRUD + navegação - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Front-load de TODO o substrato de dados do módulo Carro (tabelas `carros` e `abastecimentos`, coluna nullable `transactions.carro_id`, views de consumo, RLS + ownership) e a primeira fatia vertical de uso: o usuário cria/edita/arquiva carro(s) numa aba dedicada `/carros`, com a navegação (sidebar + bottom-nav) e as rotas `/carros` + `/carros/[id]` resolvendo. As fatias que CONSOMEM o substrato (etiquetar gastos, abastecimento/consumo, gráfico) ficam para as fases 9-11. Design seed: `docs/superpowers/specs/2026-06-17-modulo-carro-design.md` (decisões D1-D5 travadas).

</domain>

<decisions>
## Implementation Decisions

### Cadastro & CRUD do carro
- UI de criar/editar carro é **dialog modal**, no mesmo padrão de `reserva-form`/`nf-form` (Zod + react-hook-form, result shape `{ ok: true } | { error }`).
- Campos: **apelido obrigatório**; **modelo, placa, ano, combustível-padrão opcionais**.
- Combustível-padrão é um **select** com opções fixas: Flex, Gasolina, Etanol, Diesel, GNV.
- Arquivar/desarquivar é **toggle soft** (`is_archived` boolean) com toast; carros arquivados ocultos por padrão na lista, com filtro "mostrar arquivados".

### Navegação & lista
- Item **"Carros" (ícone `Car` do lucide)** na sidebar, posicionado **após "Reservas"**.
- **Adiciona "Carros" também na bottom-nav mobile** (passa de 5 para 6 itens) — exigido pelo success criteria #2.
- Lista `/carros` nesta fase mostra **identidade do carro** (apelido, modelo/placa/ano) + **badge de arquivado**. KPIs (gasto total, km/l médio) só aparecem quando houver dados, nas fases 9-11.
- `/carros/[id]` nesta fase é **detalhe mínimo** (campos do carro + ações editar/arquivar). Seções de gasto por categoria, histórico de abastecimento e gráfico de consumo chegam nas fases 9, 10 e 11.

### Schema & segurança (do spec + success criteria — não-negociável)
- Tabela `carros` (id, user_id→auth.users CASCADE, apelido, modelo, placa, ano, combustivel_padrao, is_archived, created_at).
- Tabela `abastecimentos` criada já nesta fase (id, user_id, carro_id→carros CASCADE, occurred_on, odometro_km int>0, litros numeric>0, tanque_cheio bool, combustivel, transaction_id→transactions SET NULL opcional, amount_cents bigint>0 quando sem transaction_id, note, created_at) com CHECK XOR (transaction_id XOR amount_cents) e índice único parcial em transaction_id where not null. Sem UI de abastecimento nesta fase — só o substrato.
- Coluna `transactions.carro_id uuid → carros(id) ON DELETE SET NULL` (nullable; não altera contabilidade/metas).
- Views `v_abastecimento_consumo` e `v_carro_resumo` com `security_invoker = true` (existem já nesta fase, mesmo que consumidas só depois).
- RLS `(select auth.uid()) = user_id` + `WITH CHECK` em `carros` e `abastecimentos`; grants authenticated/service_role; índice por user_id.
- `assertOwnedCarro` re-deriva posse no servidor antes de cada FK write; service-role nunca no bundle do cliente.
- Dinheiro em centavos inteiros (bigint); litros como `numeric` (não é dinheiro). Datas pinadas em America/Sao_Paulo via `src/lib/month.ts`.
- Regenerar `database.types.ts` após a migração (sem drift).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/money.ts` (`centsToBigInt`, `formatCents`, `parseBRLToCents`), `src/lib/month.ts` (helpers SP).
- `src/lib/ownership.ts` (`assertOwned*` re-derive pattern) — modelar `assertOwnedCarro`.
- Forms: `reserva-form.tsx` / `nf-form.tsx` (dialog Zod + react-hook-form), schemas em `src/lib/schemas/*`.
- Tabela/lista: padrão das tabelas densas + `sonner` toasts; shadcn `Dialog`, `Select`, `Badge`.

### Established Patterns
- Server actions: Zod safeParse → `getClaims()` → `assertOwned*` → insert/update → `revalidatePath`; nunca throw, sempre `{ ok }|{ error }`.
- Migrações SQL versionadas em `supabase/migrations/`; views `security_invoker=true` (ex: `0015_reserva_balance_view.sql`); RLS uniforme (ex: `0001`, `0013`, `0025`).
- Nav: `NAV_ITEMS` em `src/components/app-sidebar.tsx` e `src/components/bottom-nav.tsx`; active via `pathname.startsWith`.
- Módulo MEI (`src/app/(app)/mei/`, `src/actions/mei.ts`, `src/lib/schemas/mei.ts`, `src/lib/mei/`) é o template de módulo autocontido.

### Integration Points
- Nova rota segment `src/app/(app)/carros/` (layout opcional + `page.tsx` + `[id]/page.tsx`).
- `NAV_ITEMS` (sidebar + bottom-nav) ganha o item Carros.
- `transactions` ganha a coluna `carro_id` (migração) — sem tocar lógica existente.

</code_context>

<specifics>
## Specific Ideas

- Espelhar a estrutura do módulo MEI (rota + actions + schema + lib) para o módulo Carro.
- Reusar o padrão "qual reserva?" como referência para o seam de etiquetagem (fase 9), mas não nesta fase.

</specifics>

<deferred>
## Deferred Ideas

- Etiquetar gastos da fatura ao carro (CAR-02) → Phase 9.
- UI/lógica de abastecimento + cálculo de consumo (CAR-03/04) → Phase 10.
- Detalhe rico do carro + gráfico de consumo + KPIs na lista (CAR-05) → Phase 11.
- Lembretes de manutenção, OCR de nota, depreciação/seguro/IPVA → fora do v1.2 (Out of Scope no spec).

</deferred>
