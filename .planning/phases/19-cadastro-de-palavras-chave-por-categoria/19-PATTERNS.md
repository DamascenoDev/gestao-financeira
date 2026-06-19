# Phase 19: Cadastro de palavras-chave por categoria - Pattern Map

**Mapped:** 2026-06-19
**Files analyzed:** 9 (7 new/regenerated, 2 modified)
**Analogs found:** 9 / 9 (all exact in-repo templates)

> Every file in this phase has a verified, exact in-repo analog. This is wiring,
> not invention. All excerpts below are copied from real source (line numbers
> verified by Read). The executor should mirror the analog and change ONLY the
> noted deltas.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/0036_category_keywords.sql` (NEW) | migration | CRUD (schema) | `supabase/migrations/0002_categories.sql` + `0021_merchant_patterns.sql` | exact |
| `src/lib/schemas/category-keyword.ts` (NEW) | schema | transform/validation | `src/lib/schemas/category.ts` (`nameSchema`) | exact |
| `src/actions/category-keywords.ts` (NEW) | action (server) | CRUD / request-response | `src/actions/categories.ts` | exact |
| `src/actions/category-keywords.test.ts` (NEW) | test | CRUD (mocked) | `src/actions/categories.test.ts` | exact |
| `src/components/category-keywords-dialog.tsx` (NEW) | component (client) | event-driven (form/transition) | `src/components/categoria-form.tsx` + `src/components/category-filter.tsx:106-122` | exact (two-source) |
| `src/components/category-keywords-dialog.test.tsx` (NEW, optional) | test | component | `src/components/receita-row-actions.test.tsx` | role-match |
| `src/components/category-row-actions.tsx` (MODIFIED) | component (client) | event-driven | self (existing edit/delete pattern) | self-edit |
| `src/app/(app)/categorias/page.tsx` (MODIFIED) | route (RSC) | CRUD (fetch) | self (`txCountByCategory` Map) | self-edit |
| `src/types/database.types.ts` (REGENERATED) | config | — | `npm run gen:types` (NOT hand-edited) | tooling |
| normalization | reuse | transform | `src/lib/normalize.ts` `normalizeDescriptor` | reuse-as-is |

---

## Pattern Assignments

### `supabase/migrations/0036_category_keywords.sql` (migration, CRUD-schema)

**Analog:** `supabase/migrations/0002_categories.sql` (RLS-own template) + `0021_merchant_patterns.sql` (per-user FK-to-categories + column-list `unique`).

**Table + indexes + RLS + grants — copy the `0021` shape, swap columns** (`0002:10-33`, `0021:15-37`):
```sql
create table if not exists public.category_keywords (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  keyword     text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, category_id, keyword)
);

create index if not exists category_keywords_user_id_idx
  on public.category_keywords (user_id);
create index if not exists category_keywords_category_id_idx
  on public.category_keywords (category_id);

alter table public.category_keywords enable row level security;

grant select, insert, update, delete
  on public.category_keywords to authenticated, service_role;

drop policy if exists "own category_keywords" on public.category_keywords;
create policy "own category_keywords" on public.category_keywords
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

**Copy verbatim from analogs:**
- `references public.categories(id) on delete cascade` — identical to `0021_merchant_patterns.sql:19`.
- `(select auth.uid()) = user_id` wrapped in `select` (plan caching) — identical to `0002:32` and `0021:35`.
- `grant ... to authenticated, service_role` — identical uniform shape (`0002:27`, `0021:31`); `service_role` bypasses RLS.
- `unique (user_id, category_id, keyword)` — column-list constraint syntax mirrors `0021:24` (`unique (user_id, descriptor_norm)`).

**Change vs analog:**
- `on delete cascade` on `category_id` (keyword is category-owned metadata) — DIFFERS from `transactions` RESTRICT. Both `0002` and `0021` already use cascade on `category_id`, so this is the established cascade, not new.
- Add the second index on `(category_id)` (the merchant_patterns analog only indexes `user_id`).
- `keyword` column is plain `text` (no enum/check).
- NO `handle_new_user()` seed block (that part of `0002` is category-specific; do not copy).

**[BLOCKING] sequencing:** after writing `0036` → `supabase db push`/reset local → `npm run gen:types` → commit `database.types.ts` BEFORE writing the action (the typed `.from('category_keywords')` will not type-check otherwise). Pre-commit hook may rewrite `database.types.ts` (project memory `dev-env-testing-gotchas`).

---

### `src/lib/schemas/category-keyword.ts` (schema, validation)

**Analog:** `src/lib/schemas/category.ts:23` (`name: z.string().trim().min(1, 'Informe o nome').max(60)`).

**Core pattern — extract the bare keyword schema (not an object, just the string):**
```typescript
import { z } from 'zod'

export const keywordSchema = z
  .string()
  .trim()
  .min(1, 'Informe uma palavra-chave.')
  .max(60, 'Use até 60 caracteres.')

export type KeywordInput = z.infer<typeof keywordSchema>
```

**Change vs analog:** standalone string schema (the keyword action takes a raw string arg, not a `FormData`/object). Same `trim/min1/max60` constraints as the category `name`. pt-BR messages from UI-SPEC Copywriting Contract.

---

### `src/actions/category-keywords.ts` (action, CRUD / request-response)

**Analog:** `src/actions/categories.ts` — the canonical server-action shape.

**Imports + module preamble** (mirror `categories.ts:1-13,28,36,47`):
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { keywordSchema } from '@/lib/schemas/category-keyword'
import { normalizeDescriptor } from '@/lib/normalize'
import { createClient } from '@/lib/supabase/server'

const CATEGORIAS_PATH = '/categorias'
const idSchema = z.string().uuid('Identificador inválido')   // WR-06 — copied from categories.ts:47
```

**Discriminated result types** (mirror `categories.ts:28-34` — `DeleteCategoryResult` is the precedent for a 3-arm union):
```typescript
export type ActionResult = { error: string } | { ok: true }
// Duplicate is a friendly no-op, NOT an error (UI-SPEC: toast.info "já cadastrada").
export type AddKeywordResult = { ok: true } | { duplicate: true } | { error: string }
```

**`addKeyword` core pattern** — copy the `createCategory` boundary (`categories.ts:54-81`) + the `deleteCategory` 23503 friendly-backstop idea (`categories.ts:208-216`), remapped to 23505:
```typescript
export async function addKeyword(categoryId: string, keyword: string): Promise<AddKeywordResult> {
  if (!idSchema.safeParse(categoryId).success) return { error: 'Identificador inválido.' }

  const parsed = keywordSchema.safeParse(keyword)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  const normalized = normalizeDescriptor(parsed.data)           // REUSE normalize.ts — never re-derive
  if (normalized === '') return { error: 'Informe uma palavra-chave.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()       // owner — categories.ts:67-69
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { data: existing } = await supabase
    .from('category_keywords').select('id')
    .eq('category_id', categoryId).eq('keyword', normalized).maybeSingle()
  if (existing) return { duplicate: true }                       // calm pre-check no-op

  const { error } = await supabase.from('category_keywords').insert({
    user_id: userId, category_id: categoryId, keyword: normalized,
  })
  if (error) {
    if (error.code === '23505') return { duplicate: true }       // race backstop (mirrors 23503 in deleteCategory)
    return { error: 'Não foi possível salvar a palavra-chave.' }
  }
  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}
```

**`removeKeyword` core pattern** — copy `deleteCategory`'s id-guard + delete + revalidate, minus the tx-count pre-check (`categories.ts:185-219`):
```typescript
export async function removeKeyword(keywordId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(keywordId).success) return { error: 'Identificador inválido.' }
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }
  const { error } = await supabase.from('category_keywords').delete().eq('id', keywordId)
  if (error) return { error: 'Não foi possível remover a palavra-chave.' }
  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}
```

**Copy verbatim:** `'use server'` directive, `getClaims()` → `claims?.claims.sub` owner derivation, `idSchema` WR-06 guard, discriminated `{error}|{ok:true}`, `revalidatePath('/categorias')`, never-leak-raw-DB-error discipline.

**Change vs analog:** `addKeyword` takes two positional args (categoryId, keyword) not a `FormData`; normalize the keyword via `normalizeDescriptor` before insert; map 23505 (not 23503) to a friendly `{duplicate:true}`; add the pre-check `maybeSingle` select. NO RPC, NO tx-count pre-check, NO archive/reassign arms.

---

### `src/actions/category-keywords.test.ts` (test, mocked CRUD)

**Analog:** `src/actions/categories.test.ts:1-139` — the `makeBuilder`/`supabaseMock` harness.

**Copy verbatim:**
- `revalidatePath` mock (`categories.test.ts:14-17`).
- The whole `makeBuilder` builder + `supabaseMock` + `vi.mock('@/lib/supabase/server', ...)` (`categories.test.ts:42-115`).
- `claimsSub` toggle for the session-gate test (`categories.test.ts:36, 106-110`).
- Real-UUID constants for WR-06 (`categories.test.ts:133-135`).

**Change vs analog (the one harness addition):** the builder currently resolves via `.single()` / `.then` only (`categories.test.ts:89-94`). Add a `builder.maybeSingle = vi.fn(() => Promise.resolve(dupPreCheckResult))` and a settable `dupPreCheckResult` + an `insertResult` 23505 variant, to cover the pre-check AND the 23505 backstop duplicate paths.

**Tests to write** (from RESEARCH Phase Requirements → Test Map, lines 477-487): add (owner+normalized+revalidate), normalize (raw→normalized payload assertion using the REAL `normalizeDescriptor`, do not mock it), empty/whitespace/normalizes-to-`''`, too-long(>60), duplicate via pre-check AND via 23505, remove (delete by id + revalidate), non-UUID guard (WR-06), session gate.

---

### `src/components/category-keywords-dialog.tsx` (component, client / event-driven)

**Analog A (dialog skeleton):** `src/components/categoria-form.tsx`.
**Analog B (removable chip recipe):** `src/components/category-filter.tsx:106-122`.

**Controlled-open + useTransition skeleton** — copy from `categoria-form.tsx:93-104, 174-187, 245-253`:
```typescript
'use client'
import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { addKeyword, removeKeyword } from '@/actions/category-keywords'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogClose, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'

// controlled open (always controlled here — no inline trigger):
//   open={props.open} onOpenChange={props.onOpenChange}
const [isPending, startTransition] = useTransition()   // categoria-form.tsx:104
```

**Removable chip — copy verbatim, swap label/aria/onClick** (`category-filter.tsx:109-120`):
```typescript
<Badge key={kw.id} variant="secondary" className="gap-1">
  {kw.keyword}
  <button
    type="button"
    aria-label={`Remover palavra-chave ${kw.keyword}`}
    className="ml-0.5 inline-flex"
    onClick={() => startTransition(async () => {
      const r = await removeKeyword(kw.id)
      if ('error' in r) toast.error(r.error)
      else toast.success('Palavra-chave removida.')
    })}
  >
    <X className="size-3" />
  </button>
</Badge>
```
Difference from `category-filter` chip: NO `<CategoryDot>` (keywords have no color); label is the normalized keyword.

**Add form** — mirror `categoria-form.tsx:188-207, 245-253` onSubmit + `useTransition` + Field/FieldError; on `{ok:true}` `toast.success('Palavra-chave adicionada.')` + clear & refocus input; on `{duplicate:true}` `toast.info('"{keyword}" já está cadastrada nesta categoria.')`; on `{error}` `toast.error`. Pending button label `'Adicionando…'` (mirrors `{isPending ? 'Salvando…' : 'Salvar'}` at `categoria-form.tsx:250`). Footer = single `DialogClose` "Fechar" (NO "Salvar" — immediate-persist, not batch).

**Empty state** — `Empty`/`EmptyHeader`/`EmptyTitle`/`EmptyDescription` (already used in `categorias/page.tsx:5-11, 85-95`) when `keywords.length === 0`.

**All copy/labels/states are LOCKED in 19-UI-SPEC.md §Copywriting Contract.** Props shape: `{ open, onOpenChange, category: {id, name}, keywords: {id, keyword}[] }`.

---

### `src/components/category-row-actions.tsx` (MODIFIED, client)

**Self-edit — copy the existing edit/delete controlled-dialog pattern for a third state** (`category-row-actions.tsx:45-46, 59-64, 69-91`).

**Deltas:**
1. Import: `+ import { CategoryKeywordsDialog } from '@/components/category-keywords-dialog'`.
2. Props: add `keywords: { id: string; keyword: string }[]` to the `Category` type (line 17-23) or as a sibling prop.
3. State: `const [keywordsOpen, setKeywordsOpen] = React.useState(false)` (mirrors `editOpen`/`deleteOpen` at line 45-46).
4. Menu item BETWEEN "Editar" (line 59-61) and the destructive "Excluir" (line 62-64) so the destructive stays last:
```typescript
<DropdownMenuItem onClick={() => setKeywordsOpen(true)}>
  {category.keywords.length > 0
    ? `Palavras-chave (${category.keywords.length})`
    : 'Palavras-chave'}
</DropdownMenuItem>
```
5. Render the controlled dialog alongside the existing two (line 69-91):
```typescript
<CategoryKeywordsDialog
  open={keywordsOpen}
  onOpenChange={setKeywordsOpen}
  category={{ id: category.id, name: category.name }}
  keywords={category.keywords}
/>
```

---

### `src/app/(app)/categorias/page.tsx` (MODIFIED, RSC)

**Self-edit — mirror the existing `txCountByCategory` Map** (`page.tsx:44-55`).

**Deltas:**
1. New grouped fetch (after the `totals` fetch, ~line 46) — RLS scopes to caller, NO `.eq('user_id', …)` (the existing `categories`/`totals` fetches also rely on RLS, never filter by user_id):
```typescript
const { data: keywordRows } = await supabase
  .from('category_keywords')
  .select('id, category_id, keyword')
  .order('keyword', { ascending: true })

const keywordsByCategory = new Map<string, { id: string; keyword: string }[]>()
for (const row of keywordRows ?? []) {
  if (!row.category_id) continue
  const list = keywordsByCategory.get(row.category_id) ?? []
  list.push({ id: row.id, keyword: row.keyword })
  keywordsByCategory.set(row.category_id, list)
}
```
2. Inside `rows.map` (line 107-108), alongside `txCount`: `const keywords = keywordsByCategory.get(row.id) ?? []`.
3. Thread into `<CategoryRowActions>` (line 122-131): add `keywords={keywords}` to the `category` prop object.

This exactly mirrors the existing Map-grouping idiom (`txCountByCategory`); no join/view/second-count query (Claude's-discretion confirmed, RESEARCH A3).

---

### `src/types/database.types.ts` (REGENERATED — NOT hand-edited)

Regenerated by `npm run gen:types` after `0036` is applied to the local stack. The new `category_keywords` block will surface as a Row/Insert/Update set next to the existing `categories:` block (`database.types.ts:205`). Commit the regenerated file. Pre-commit hook may rewrite it — verify `category_keywords` is present after commit. Never hand-edit.

---

## Shared Patterns

### Normalization (reuse, single source)
**Source:** `src/lib/normalize.ts` — `normalizeDescriptor(raw: string): string`.
**Apply to:** `addKeyword` only (call ONCE before insert; the chip displays the normalized value).
**Rule:** This is THE only place the merchant-key is derived (file header lines 1-3). Never re-derive in the action, the dialog, or a query — drift breaks Phase 20's apples-to-apples substring match against `descriptor_norm`. `''` output = empty-validation error.

### Owner / session gate (V2/V4)
**Source:** `src/actions/categories.ts:67-69` — `const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims.sub; if (!userId) return { error: 'Sessão expirada.' }`.
**Apply to:** both keyword actions. `addKeyword` sets `user_id: userId` on insert (the `with check` half of RLS, KW-06).

### WR-06 UUID guard (IDOR defense-in-depth)
**Source:** `src/actions/categories.ts:47` — `const idSchema = z.string().uuid('Identificador inválido')`.
**Apply to:** every row-id arg before `.eq('id', …)` / `.eq('category_id', …)` — `categoryId` in `addKeyword`, `keywordId` in `removeKeyword`.

### Friendly DB-error mapping (no raw leak)
**Source:** `src/actions/categories.ts:208-216` — `deleteCategory` maps 23503 to a friendly message, generic fallback otherwise.
**Apply to:** `addKeyword` maps 23505 → `{duplicate:true}` (race backstop); everything else → `'Não foi possível salvar…'`. Never return `error.message`.

### Uniform RLS table shape
**Source:** `0002_categories.sql:22-33` / `0021_merchant_patterns.sql:29-37`.
**Apply to:** `0036` migration — `enable row level security` + explicit grants to `authenticated, service_role` + a single `for all` "own" policy with `using` + `with check` of `(select auth.uid()) = user_id` + a `user_id` index. Non-negotiable per CLAUDE.md (financial-data isolation).

### Controlled dialog (open state owned by RowActions)
**Source:** `category-row-actions.tsx:45-46, 69-91` (edit/delete) + `categoria-form.tsx:93-104` (controlled `open`/`onOpenChange`).
**Apply to:** the new keyword dialog — third controlled open state, no inline trigger.

---

## No Analog Found

None. Every file maps to a verified in-repo template.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | All 9 files have exact analogs. |

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `src/actions/`, `src/lib/schemas/`, `src/lib/`, `src/components/`, `src/app/(app)/categorias/`, `src/types/`.
**Files read for excerpts:** `categories.ts`, `0002_categories.sql`, `0021_merchant_patterns.sql`, `category.ts`, `categoria-form.tsx`, `category-filter.tsx`, `category-row-actions.tsx`, `normalize.ts`, `categorias/page.tsx`, `categories.test.ts` (+ grep on `database.types.ts`).
**Pattern extraction date:** 2026-06-19
