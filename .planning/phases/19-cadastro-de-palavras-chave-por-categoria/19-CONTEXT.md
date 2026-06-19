# Phase 19: Cadastro de palavras-chave por categoria - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Na tela `/categorias`, o usuário mantém manualmente a lista de palavras-chave de cada
categoria — adicionar e remover — com os dados isolados por usuário (RLS). Entrega
KW-01 (CRUD manual de keywords) + KW-06 (escopo `user_id` + RLS, multi-user-ready).

**Fora de escopo (Phase 20):** matching de palavra-chave no upload, ordem memória→
palavra-chave→IA, "palavra-chave mais longa vence", pré-preenchimento `source="palavra-chave"`.
Esta fase é SÓ o cadastro (criar/listar/remover). **Sem regex/wildcard** (KW-F2). **Sem
auto-aprendizado** de keywords (KW-F1) — cadastro manual explícito.
</domain>

<decisions>
## Implementation Decisions

### Modelo de dados (category_keywords)
- Nova tabela `public.category_keywords(id uuid pk, user_id uuid not null →auth.users on delete cascade, category_id uuid not null →public.categories(id) on delete cascade, keyword text not null, created_at timestamptz default now())`.
- RLS no mesmo shape uniforme das tabelas de domínio (espelhar `0002_categories.sql`): `enable row level security`; `grant select,insert,update,delete ... to authenticated, service_role`; policy "own category_keywords" `for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)`; índice em `(user_id)` (e provavelmente `(category_id)`).
- **keyword é armazenado NORMALIZADO** com o MESMO normalizador do `descriptor_norm` — `normalizeDescriptor` de `src/lib/normalize.ts` — para que o match do Phase 20 (substring em `descriptor_norm`) seja apples-to-apples. Exibir o valor normalizado de volta.
- **Unicidade:** `unique(user_id, category_id, keyword)` — sem duplicata na mesma categoria (o mesmo termo PODE existir em outra categoria; o conflito cross-categoria é resolvido no Phase 20 por "mais longa vence").
- **ON DELETE CASCADE** quando a categoria é apagada (keyword é metadado próprio da categoria; diferente de `transactions`, que usa RESTRICT + reatribuição).
- Migration nova (próximo número após `0035` → `0036`). Schema novo → **`npm run gen:types` necessário** + regen de `database.types.ts` (≠ Phase 18, que era data-only).

### UI — edição na tela /categorias
- Novo item **"Palavras-chave…"** no `CategoryRowActions` (junto de Editar/Excluir) → abre um **Dialog** dedicado por categoria (espelha o padrão do Editar/CategoriaForm).
- Dentro do Dialog: keywords renderizadas como **chips removíveis** (Badge + botão ×) + um **input + "Adicionar"**. `useTransition` + `toast` (sonner), igual `categoria-form.tsx`.
- **Persistência imediata por ação:** add → server action → `revalidatePath('/categorias')`; remove → server action. Mesmo padrão dos toggles de campo único (`setKind`/`setColor`), sem "salvar em lote".
- Contador discreto no item do menu ("Palavras-chave (N)") — N vem do server fetch da página.

### Validação & escopo (server actions)
- Novo arquivo de actions (ex.: `src/actions/category-keywords.ts`) espelhando `categories.ts`: `'use server'`, Zod `safeParse` no boundary → `{error}|{ok:true}`, `getClaims()` p/ o owner, `idSchema` uuid p/ ids de linha (WR-06), `revalidatePath('/categorias')`.
- **Normalizar ao salvar** via `normalizeDescriptor`. Limites: trim, min 1, max 60 (igual nome de categoria). Sem regex/wildcard.
- **Duplicata no add:** toast amigável "já cadastrada" (sem erro de validação), garantido pela unique + pré-check.
- Ações: `addKeyword(categoryId, keyword)`, `removeKeyword(keywordId)` (e o fetch da lista na RSC). NADA de matching/classificação nesta fase.

### Claude's Discretion
- Nome exato do arquivo de actions / componente do Dialog (ex.: `category-keywords-dialog.tsx`).
- Schema Zod das keywords (provável `src/lib/schemas/category-keyword.ts` espelhando `category.ts`).
- Se a contagem por categoria vem de um segundo `select` agregado ou de um join na RSC.
- Cobertura de testes: actions (add/remove/validação/RLS-owner) + componente, seguindo os padrões de `categories.test.ts` e dos testes de componente existentes.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/normalize.ts` — `normalizeDescriptor(raw): string`. REUSAR para normalizar keyword (consistência com `descriptor_norm` p/ Phase 20).
- `src/actions/categories.ts` — padrão canônico de server action: `'use server'`, Zod boundary, `getClaims()`, `idSchema = z.string().uuid(...)` (WR-06), discriminated `{error}|{ok:true}`, `revalidatePath('/categorias')`. Espelhar.
- `src/components/categoria-form.tsx` — padrão de Dialog client: `useTransition`, `toast`, estado manual, `DialogTrigger`/`DialogContent`. Espelhar para o dialog de keywords.
- `src/components/category-row-actions.tsx` — menu por linha (Editar/Excluir via `DropdownMenuItem`). Ponto de inserção do item "Palavras-chave…".
- `src/components/category-badge.tsx` (`CategoryBadge`, `SWATCH_OKLCH`) + `src/components/ui/*` (Dialog, Badge, Input, Button, Field) — chips removíveis.
- `supabase/migrations/0002_categories.sql` — template exato de tabela RLS-own + grants + índice. `0021_merchant_patterns.sql` — analog per-user (merchant→categoria).

### Established Patterns
- RLS em TODA tabela de domínio: `using/with check ((select auth.uid()) = user_id)`, `to authenticated`, grants explícitos (service_role bypassa). `user_id` em toda tabela desde o dia 1.
- `/categorias` é RSC (`src/app/(app)/categorias/page.tsx`) — fetch server-side via `createClient()`, renderiza `Table` + por linha `CategoryRowActions`.
- Money/dates irrelevantes aqui (texto puro). TS estrito, sem JS.
- `npm run gen:types` após migration → commitar `database.types.ts` (pre-commit hook pode reescrevê-lo — ver [[dev-env-testing-gotchas]]).

### Integration Points
- `category_keywords` FK → `categories(id)`; nova migration `0036`.
- `page.tsx`: novo fetch de keywords (lista + contagem por categoria) passado ao `CategoryRowActions`.
- `CategoryRowActions`: novo item de menu + estado de open do novo Dialog.
- `database.types.ts`: nova tabela aparece após `gen:types`.
</code_context>

<specifics>
## Specific Ideas

- Exemplo do success criteria: adicionar "uber" em Transporte → persiste e aparece na lista; remover → some.
- Phase 20 fará o match `substring(keyword) in descriptor_norm` — por isso o keyword é guardado já normalizado por `normalizeDescriptor` (mesma função que gera `descriptor_norm`).
- Memória do projeto: PROD foi wiped (re-signup necessário p/ ver dados) e a migration `0036` precisará de `supabase db push` em PROD por você (mesmo padrão da MKT-01/0035) — mas em DEV/local os testes rodam contra o schema migrado.
</specifics>

<deferred>
## Deferred Ideas

- Matching no upload, ordem memória→palavra-chave→IA, "mais longa vence", `source="palavra-chave"`, sobrescrita na grid — **Phase 20** (KW-02/03/04/05).
- Sugestão automática de keywords a partir de padrões confirmados — KW-F1 (futuro).
- Match por regex/wildcard — KW-F2 (futuro).
</deferred>
