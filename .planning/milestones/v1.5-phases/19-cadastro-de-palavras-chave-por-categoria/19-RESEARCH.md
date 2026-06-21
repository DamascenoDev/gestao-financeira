# Phase 19: Cadastro de palavras-chave por categoria - Research

**Researched:** 2026-06-19
**Domain:** Per-user CRUD on an existing mature Next.js 16 / Supabase / TS-strict app — new domain table (`category_keywords`) + RLS + server actions + one dialog wired into `/categorias`.
**Confidence:** HIGH

## Summary

This is a small, additive, **fully-precedented** CRUD feature on a mature codebase. Every piece has an exact in-repo template: the migration mirrors `0002_categories.sql` / `0021_merchant_patterns.sql`; the server actions mirror `src/actions/categories.ts` (`'use server'`, Zod `safeParse` boundary, `getClaims()` owner, `idSchema` UUID per WR-06, discriminated `{error}|{ok:true}`, `revalidatePath('/categorias')`); the dialog mirrors `categoria-form.tsx` (controlled `open`, `useTransition`, sonner `toast`); the removable chip is the verbatim recipe in `category-filter.tsx:106-122`; and tests split into mocked action unit tests (`src/**/*.test.ts`) plus live-Docker RLS integration tests (`tests/**/*.test.ts` via `tests/helpers/local-supabase.ts`). There are **no new dependencies** — `normalizeDescriptor`, `sonner`, `useTransition`, and all shadcn primitives are already vendored. [VERIFIED: codebase grep]

Two things make Phase 19 different from Phase 18 and require explicit planner attention. **(1) A real schema migration `0036` + `npm run gen:types`** — `database.types.ts` must be regenerated and committed, and the pre-commit hook may rewrite it (project memory `dev-env-testing-gotchas`). This is a [BLOCKING] sequencing step: the action's typed `.from('category_keywords')` will not type-check until `gen:types` runs against the migrated local schema. **(2) `keyword` is stored NORMALIZED** via `normalizeDescriptor` (the same function that produces `descriptor_norm`) so Phase 20's substring match is apples-to-apples; the chip displays the normalized value, and an input that normalizes to `''` is treated as the empty-validation error. [CITED: 19-CONTEXT.md, 19-UI-SPEC.md]

The lower-complexity, codebase-consistent path is: RSC fetches all of the user's keywords in one `select`, groups them in-memory by `category_id`, and threads both the per-category list and count down through `CategoryRowActions` into a new controlled dialog (no client-side fetching — matches how `targets`/`txCount` are already threaded). Persist immediately per action (no batch save), exactly like the `setKind`/`setColor` toggles.

**Primary recommendation:** Mirror `categories.ts` + `categoria-form.tsx` + `category-filter.tsx` exactly. Add migration `0036`, run `gen:types`, create `src/lib/schemas/category-keyword.ts`, `src/actions/category-keywords.ts` (`addKeyword`/`removeKeyword`), `src/components/category-keywords-dialog.tsx`, edit `CategoryRowActions` (+1 menu item, +1 open state) and `categorias/page.tsx` (+1 grouped fetch). Handle duplicates as a friendly `toast.info` "já cadastrada" via a pre-check select backed by the `unique(user_id, category_id, keyword)` constraint (23505 as backstop).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Keyword persistence + isolation | Database / Storage (Postgres + RLS) | API/Backend (server action sets `user_id`) | RLS `auth.uid()=user_id` is the real isolation gate (KW-06); never app-layer-only filtering per CLAUDE.md |
| Add/remove keyword business logic | API/Backend (Server Actions) | — | `'use server'` actions own validation, normalization, owner derivation, duplicate handling |
| Input validation + normalization | API/Backend (Zod + `normalizeDescriptor`) | Browser (maxLength=60 client hint) | Server is authoritative; `maxLength` on Input is UX-only, server re-validates |
| Keyword list + count fetch | Frontend Server (RSC `page.tsx`) | — | RSC `createClient()` fetch threaded as props — matches existing `targets`/`txCount` pattern |
| Dialog interaction (chips/input/toasts) | Browser / Client (`'use client'` dialog) | — | `useTransition` + sonner, mirrors `categoria-form.tsx` |
| Cache invalidation | API/Backend (`revalidatePath`) | Frontend Server (RSC re-render) | Action calls `revalidatePath('/categorias')`; page re-renders with fresh list/count |

## Standard Stack

No new packages. Everything is already installed and version-locked. [VERIFIED: package.json]

### Core (reused, already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.9 | App Router, Server Actions, `revalidatePath` | Locked stack; RSC + actions are the home for the fetch + mutations |
| `@supabase/ssr` | 0.12.0 | Cookie-based server client (`createClient`) | The established server-fetch + action client (`@/lib/supabase/server`) |
| `zod` | 4.4.3 | Boundary validation | `safeParse` at action boundary, identical to `categories.ts` |
| `sonner` | 2.0.7 | Toasts (success / info-duplicate / error) | Already the project toast; `toast.success`/`toast.info`/`toast.error` |
| `lucide-react` | 1.20.0 | `X` icon for chip-remove | Same import as `category-filter.tsx` |
| shadcn primitives | vendored | Dialog, Badge, Input, Button, Field, Empty, DropdownMenu | All already vendored under `src/components/ui/*`; none re-added (per UI-SPEC Registry Safety) |
| `supabase` CLI | 2.106.0 (dev) | migration + `gen:types` | `npm run db:push`, `npm run gen:types` |

### Supporting (reused)
| Asset | Path | Purpose |
|-------|------|---------|
| `normalizeDescriptor` | `src/lib/normalize.ts` | Normalize keyword on save (same key space as `descriptor_norm`) |
| `getClaims()` owner pattern | `src/actions/categories.ts` | `claims?.claims.sub` → `user_id` on insert / session gate |
| `idSchema` | inline in `categories.ts` (`z.string().uuid(...)`) | WR-06 UUID guard for `keywordId` / `categoryId` row args |
| removable-chip recipe | `src/components/category-filter.tsx:106-122` | `Badge variant="secondary" className="gap-1"` + `<button aria-label><X className="size-3"/>` |
| controlled-dialog skeleton | `src/components/categoria-form.tsx` | `useTransition`, controlled `open`, `DialogHeader/Footer/Close` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One grouped RSC `select` of all keywords, group in JS | A second aggregated count query OR a Postgres join/view | Extra query/migration for zero benefit at single-user scale — keyword counts are tiny. Group-in-JS mirrors the existing `txCountByCategory` Map in `page.tsx` exactly. **Recommended: grouped select + JS Map.** |
| Dialog receives keywords as props (RSC-seeded) | Dialog fetches its own keywords client-side | Client fetch adds a route handler / client query for no gain and diverges from how `targets`/`txCount` already flow. **Recommended: props from RSC.** |
| Pre-check select for duplicate → `toast.info` | Rely only on 23505 unique-violation | Pre-check gives the calm "já cadastrada" no-op without a thrown DB error round-trip; keep 23505 as the race backstop (mirrors the 23503 backstop in `deleteCategory`). **Recommended: pre-check + 23505 backstop.** |

**Installation:** None. (No new runtime or dev dependency this phase — confirmed against `package.json`.)

## Package Legitimacy Audit

> Not applicable — this phase installs **zero** external packages. All libraries (`next`, `@supabase/ssr`, `zod`, `sonner`, `lucide-react`, shadcn primitives, `supabase` CLI) are already present in `package.json` and proven in production. [VERIFIED: package.json]

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                       /categorias (RSC — page.tsx)
                                │
        ┌───────────────────────┼───────────────────────────┐
        │ createClient() (server)                            │
        │  ① select categories (existing)                    │
        │  ② select v_category_totals → txCount (existing)   │
        │  ③ select category_keywords (NEW, grouped in JS)   │
        │     → Map<category_id, {id,keyword}[]>             │
        └───────────────────────┬───────────────────────────┘
                                │ props: keywords[], count
                                ▼
                    CategoryRowActions ('use client')
                     ├─ DropdownMenuItem "Editar"
                     ├─ DropdownMenuItem "Palavras-chave (N)"  ◄── NEW (between Editar/Excluir)
                     └─ DropdownMenuItem "Excluir" (destructive)
                                │ keywordsOpen state (NEW)
                                ▼
              CategoryKeywordsDialog ('use client', NEW)
                ├─ chips region: Badge×N + X button  (remove)
                ├─ Empty primitive when N=0
                └─ <form> input + "Adicionar"        (add)
                                │ useTransition
                ┌───────────────┴────────────────┐
                ▼                                 ▼
   addKeyword(categoryId, keyword)    removeKeyword(keywordId)
   ('use server', category-keywords.ts — NEW)
                │                                 │
   Zod safeParse (trim/min1/max60)    idSchema uuid (WR-06)
   normalizeDescriptor(keyword)                   │
   → '' ⇒ "Informe uma palavra-chave"             │
   getClaims() → user_id                          │
   pre-check select (dup?) → toast.info           │
                │                                 │
                ▼                                 ▼
      supabase.from('category_keywords')   .delete().eq('id', keywordId)
        .insert({user_id, category_id, keyword})
        [RLS: auth.uid()=user_id, unique 23505 backstop]
                │                                 │
                └────────── revalidatePath('/categorias') ──────────┘
                                │
                                ▼  RSC re-renders → fresh list + (N)
```

### Recommended Project Structure (new + edited files)
```
supabase/migrations/
└── 0036_category_keywords.sql        # NEW — table + indexes + RLS + grants
src/lib/schemas/
└── category-keyword.ts               # NEW — Zod keyword schema (mirrors category.ts)
src/actions/
├── category-keywords.ts              # NEW — addKeyword / removeKeyword
└── category-keywords.test.ts         # NEW — mocked action unit tests (mirror categories.test.ts)
src/components/
├── category-keywords-dialog.tsx      # NEW — controlled dialog (mirror categoria-form.tsx)
├── category-row-actions.tsx          # EDIT — +1 menu item, +1 open state, render dialog
└── category-keywords-dialog.test.tsx # NEW (optional) — component test
src/app/(app)/categorias/
└── page.tsx                          # EDIT — +1 grouped keyword fetch, thread props
src/types/
└── database.types.ts                 # REGENERATED via npm run gen:types (commit)
tests/
└── category-keywords-rls.test.ts     # NEW (optional, live-Docker) — KW-06 isolation
```

### Pattern 1: Migration — mirror `0002` + `0021` exactly
**What:** New domain table with the uniform RLS-own shape, two indexes, the unique constraint, and explicit grants.
**When to use:** Every new domain table (non-negotiable per CLAUDE.md).
**Example (the exact `0036` SQL — adapted from `0002_categories.sql` + `0021_merchant_patterns.sql`):**
```sql
-- Source: pattern from supabase/migrations/0002_categories.sql + 0021_merchant_patterns.sql
-- 0036_category_keywords.sql
-- category_keywords: per-user manual keyword rules per category (KW-01/KW-06).
-- keyword is stored NORMALIZED (normalizeDescriptor / descriptor_norm key space) so
-- Phase 20's substring match against descriptor_norm is apples-to-apples. CRUD only;
-- NO matching/auto-classification here. Same uniform RLS shape + grants + indexes.
-- ON DELETE CASCADE on category_id: keywords are metadata owned by the category
-- (differs from transactions, which use RESTRICT + reassignment).

create table if not exists public.category_keywords (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  keyword     text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, category_id, keyword)        -- no dup term in the same category
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
Notes verified against precedent:
- FK to `public.categories(id) on delete cascade` — `0021_merchant_patterns.sql:19` uses the identical reference. [VERIFIED: codebase grep]
- `unique (user_id, category_id, keyword)` — column-list unique constraint syntax matches `0021`'s `unique (user_id, descriptor_norm)`. [VERIFIED: codebase grep]
- `(select auth.uid()) = user_id` (wrapped in `select` for plan caching) — exact shape in `0002:32` and `0021:35`. [VERIFIED: codebase grep]
- `to authenticated, service_role` grants — `service_role` bypasses RLS; this is the documented uniform shape. [VERIFIED: codebase grep]

### Pattern 2: Server actions — mirror `categories.ts`
**What:** `'use server'`, Zod boundary, `getClaims()` owner, `idSchema` UUID, discriminated `{error}|{ok:true}`, `revalidatePath('/categorias')`.
**When to use:** Every mutation.
**Example (`src/actions/category-keywords.ts`):**
```typescript
// Source: pattern from src/actions/categories.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { keywordSchema } from '@/lib/schemas/category-keyword'
import { normalizeDescriptor } from '@/lib/normalize'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { error: string } | { ok: true }
// Duplicate is a friendly no-op, NOT an error (UI-SPEC: toast.info "já cadastrada").
export type AddKeywordResult = { ok: true } | { duplicate: true } | { error: string }

const CATEGORIAS_PATH = '/categorias'
const idSchema = z.string().uuid('Identificador inválido')

export async function addKeyword(
  categoryId: string,
  keyword: string,
): Promise<AddKeywordResult> {
  if (!idSchema.safeParse(categoryId).success) return { error: 'Identificador inválido.' }

  // Validate raw length first (trim/min1/max60), then normalize. An input that
  // normalizes to '' (e.g. only punctuation) is treated as the empty error.
  const parsed = keywordSchema.safeParse(keyword)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  const normalized = normalizeDescriptor(parsed.data)
  if (normalized === '') return { error: 'Informe uma palavra-chave.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  // Pre-check for the calm duplicate no-op (RLS already scopes to the caller).
  const { data: existing } = await supabase
    .from('category_keywords')
    .select('id')
    .eq('category_id', categoryId)
    .eq('keyword', normalized)
    .maybeSingle()
  if (existing) return { duplicate: true }

  const { error } = await supabase.from('category_keywords').insert({
    user_id: userId,
    category_id: categoryId,
    keyword: normalized,
  })
  // 23505 (unique_violation) is the race backstop — treat as duplicate, not error
  // (mirrors the 23503 backstop in deleteCategory).
  if (error) {
    if (error.code === '23505') return { duplicate: true }
    return { error: 'Não foi possível salvar a palavra-chave.' }
  }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}

export async function removeKeyword(keywordId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(keywordId).success) return { error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // RLS scopes the delete to the caller — a foreign/garbage id deletes nothing.
  const { error } = await supabase
    .from('category_keywords')
    .delete()
    .eq('id', keywordId)
  if (error) return { error: 'Não foi possível remover a palavra-chave.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}
```

### Pattern 3: Zod schema — mirror `category.ts`
**Example (`src/lib/schemas/category-keyword.ts`):**
```typescript
// Source: pattern from src/lib/schemas/category.ts (nameSchema: trim/min1/max60)
import { z } from 'zod'

export const keywordSchema = z
  .string()
  .trim()
  .min(1, 'Informe uma palavra-chave.')
  .max(60, 'Use até 60 caracteres.')

export type KeywordInput = z.infer<typeof keywordSchema>
```

### Pattern 4: RSC fetch — mirror the `txCountByCategory` Map in `page.tsx`
**Example (the new fetch added to `categorias/page.tsx`):**
```typescript
// Source: pattern from src/app/(app)/categorias/page.tsx (txCountByCategory Map)
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
// ...inside the rows.map, alongside txCount:
//   const keywords = keywordsByCategory.get(row.id) ?? []
//   <CategoryRowActions category={{...}} targets={targets} keywords={keywords} />
```
RLS scopes the select to the caller — no explicit `.eq('user_id', …)` needed (the existing `categories` fetch also relies on RLS). [VERIFIED: codebase grep — `page.tsx` never filters by user_id]

### Pattern 5: Dialog + RowActions edit
**What:** Add a third controlled-open state and a third `DropdownMenuItem` between "Editar" and "Excluir"; render the new controlled dialog (no inline trigger), exactly like the edit/delete dialogs.
**Example (`CategoryRowActions` delta):**
```typescript
// + import { CategoryKeywordsDialog } from '@/components/category-keywords-dialog'
// + add to props: keywords: { id: string; keyword: string }[]
const [keywordsOpen, setKeywordsOpen] = React.useState(false)
// ...in DropdownMenuContent, between Editar and Excluir:
<DropdownMenuItem onClick={() => setKeywordsOpen(true)}>
  {category.keywords.length > 0
    ? `Palavras-chave (${category.keywords.length})`
    : 'Palavras-chave'}
</DropdownMenuItem>
// ...alongside the other controlled dialogs:
<CategoryKeywordsDialog
  open={keywordsOpen}
  onOpenChange={setKeywordsOpen}
  category={{ id: category.id, name: category.name }}
  keywords={category.keywords}
/>
```
The dialog body composes reused primitives only (Dialog/Badge/Input/Button/Field/Empty) and uses the verbatim chip recipe from `category-filter.tsx:106-122` (label = the normalized keyword; no `CategoryDot` — keywords have no color). Add = `<form onSubmit>` + `useTransition` → `addKeyword`; on `{ok:true}` `toast.success('Palavra-chave adicionada.')` + clear & refocus input; on `{duplicate:true}` `toast.info('"{keyword}" já está cadastrada nesta categoria.')`; on `{error}` `toast.error`. Remove = chip `X` → `useTransition` → `removeKeyword` → `toast.success('Palavra-chave removida.')`. Footer is a single `DialogClose` "Fechar" (no "Salvar"). All copy/labels/states are LOCKED in UI-SPEC §Copywriting Contract. [CITED: 19-UI-SPEC.md]

### Anti-Patterns to Avoid
- **Storing the raw keyword instead of the normalized form** — breaks the Phase 20 apples-to-apples match against `descriptor_norm`. Always `normalizeDescriptor(keyword)` before insert and display the normalized value. [CITED: 19-CONTEXT.md]
- **Re-deriving normalization anywhere else** — `normalize.ts` is THE single source (its own header says so). Call it once in the action. [VERIFIED: src/lib/normalize.ts header]
- **App-layer-only isolation** — never rely on `.eq('user_id', …)` alone; RLS is the gate (KW-06). The action still sets `user_id` on insert for `with check`. [CITED: CLAUDE.md]
- **Surfacing raw DB errors** (23505/23502/22P02) as toasts — map to friendly messages, exactly like the 23503 handling in `deleteCategory`. [VERIFIED: categories.ts:208-216]
- **Batch "Salvar" in the dialog** — persistence is immediate per action, like `setKind`/`setColor`. No batch save, no "Salvar" button. [CITED: 19-CONTEXT.md, 19-UI-SPEC.md]
- **A destructive-confirm on keyword remove** — removal is immediate and reversible (re-add); the `X` is muted, not destructive-red. [CITED: 19-UI-SPEC.md]
- **Forgetting `gen:types` after the migration** — `.from('category_keywords')` won't type-check (TS strict) until `database.types.ts` is regenerated. [BLOCKING]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyword normalization | A new lowercase/accent stripper | `normalizeDescriptor` (`src/lib/normalize.ts`) | Must be the SAME key space as `descriptor_norm` for Phase 20; drift = silent match failures |
| Removable chip | Custom pill + close button | `Badge variant="secondary" className="gap-1"` + `<button><X/>` from `category-filter.tsx` | Exact a11y/spacing/focus recipe already approved in UI-SPEC |
| Controlled dialog state | New open/close plumbing | The `categoria-form.tsx` controlled pattern + `CategoryRowActions` `editOpen`/`deleteOpen` precedent | Identical lifecycle; copy the third state |
| Owner/session gate | Custom auth read | `supabase.auth.getClaims()` → `claims?.claims.sub` | The one canonical owner derivation across all actions |
| UUID arg validation | Manual regex | `z.string().uuid(...)` (WR-06 `idSchema`) | Defense-in-depth + friendly error vs raw 22P02 |
| Duplicate prevention | App-only set check | `unique(user_id, category_id, keyword)` DB constraint + pre-check select | DB is the source of truth; pre-check gives the calm UX |

**Key insight:** This phase has zero genuinely-new problems. Every line has an in-repo template; the work is wiring, not invention.

## Common Pitfalls

### Pitfall 1: gen:types skipped or pre-commit hook rewrites it
**What goes wrong:** Action references `category_keywords` but `database.types.ts` lacks the table → TS-strict build fails; or the dev rewrites types from the wrong (PROD) schema.
**Why it happens:** New table requires `npm run gen:types --local` against the migrated **local** stack; the pre-commit hook may regenerate `database.types.ts` (project memory `dev-env-testing-gotchas`).
**How to avoid:** Sequence as a [BLOCKING] task: (1) write `0036`, (2) apply to local (`supabase db push`/reset), (3) `npm run gen:types`, (4) commit `database.types.ts`, THEN (5) write the action that imports the typed client. Verify `category_keywords` Row/Insert/Update surface in `database.types.ts` (will look like the `categories` block at lines 205-240, with `keyword: string` added). [VERIFIED: package.json gen:types script; database.types.ts shape]
**Warning signs:** `Property 'category_keywords' does not exist on type` from `.from(...)`.

### Pitfall 2: Storing/displaying the raw keyword
**What goes wrong:** User types "Uber" → stored as "Uber" → Phase 20 substring match against lowercased `descriptor_norm` ("uber ...") never hits.
**Why it happens:** Forgetting `normalizeDescriptor` on save.
**How to avoid:** Normalize in `addKeyword` before insert; display the normalized chip; if `normalizeDescriptor(input) === ''`, return the empty-validation error. [CITED: 19-CONTEXT.md, 19-UI-SPEC.md]
**Warning signs:** chip shows mixed-case/accents; Phase 20 fails to match obvious terms.

### Pitfall 3: Duplicate surfaced as a hard error
**What goes wrong:** Re-adding "uber" throws a 23505 toast.error instead of a calm "já cadastrada".
**Why it happens:** Relying solely on the unique constraint without mapping 23505.
**How to avoid:** Pre-check select → `{duplicate:true}` → `toast.info`; keep 23505 mapped to `{duplicate:true}` as the race backstop. [CITED: 19-UI-SPEC.md Copywriting]
**Warning signs:** red error toast on a benign re-add.

### Pitfall 4: ON DELETE behavior wrong on the category FK
**What goes wrong:** Deleting a category errors (RESTRICT) or orphans keywords.
**Why it happens:** Copying `transactions`' RESTRICT semantics instead of the metadata-cascade intent.
**How to avoid:** `category_id ... references public.categories(id) on delete cascade` — keywords are category-owned metadata. [CITED: 19-CONTEXT.md decisions]
**Warning signs:** "Não foi possível excluir a categoria" when the only blocker is keywords; stale keyword rows after a category delete.

### Pitfall 5: Live RLS test flakiness blocks the phase
**What goes wrong:** A cross-user integration test (KW-06) intermittently fails because it needs the local Docker Supabase stack.
**Why it happens:** Integration tests in `tests/**` require `supabase start`; project memory flags them env-flaky.
**How to avoid:** Make KW-06 verification primarily structural (action sets `user_id`; the policy SQL exists and matches the uniform shape; `idSchema` guards row ids) in the mocked unit tests, and treat a live `tests/category-keywords-rls.test.ts` (mirroring `tests/category-idor.test.ts`) as an OPTIONAL Wave-0 integration test, not a phase gate. [CITED: project memory gsd-execution-gotchas, dev-env-testing-gotchas]
**Warning signs:** CI red only on the Docker-backed test; green on the mocked suite.

## Runtime State Inventory

> Phase 19 is additive (new table + new code). No rename/refactor/migration of existing strings. The only "migration" is the additive `0036` DDL.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New table `category_keywords` only — no existing data rewritten. PROD was wiped (re-signup needed); no keyword data exists anywhere yet. | Apply `0036` (local + later PROD `db:push` by owner) |
| Live service config | None — no external service references keywords. | None |
| OS-registered state | None. | None |
| Secrets/env vars | None — no new env var or secret. | None |
| Build artifacts | `src/types/database.types.ts` is regenerated by `gen:types` (a generated artifact, must be committed; pre-commit hook may rewrite it). | `npm run gen:types` + commit |

**Nothing found in category:** Live service config, OS-registered state, and secrets/env vars — verified: this is a self-contained DB table + Next.js code change, no external integration. PROD migration push (`supabase db push` for `0036`) is the owner's manual action, same pattern as `0035` (project memory + CONTEXT.md specifics).

## Code Examples

### Mocked action unit test (mirror `categories.test.ts`)
```typescript
// Source: pattern from src/actions/categories.test.ts (mock @/lib/supabase/server)
// Tests addKeyword/removeKeyword: owner on insert, normalization, empty/long Zod,
// duplicate→{duplicate:true} (pre-check AND 23505), UUID guard, session gate,
// revalidatePath('/categorias'). Mock normalizeDescriptor is NOT needed — call the
// real one (deterministic, already unit-tested) and assert the normalized payload.
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))
// ...reuse the makeBuilder/supabaseMock harness from categories.test.ts, add
// `maybeSingle` returning the dup pre-check result and an `insertResult` with a
// 23505 error variant.
```

### Live RLS isolation test (OPTIONAL — mirror `tests/category-idor.test.ts`)
```typescript
// Source: pattern from tests/category-idor.test.ts + tests/helpers/local-supabase.ts
// KW-06: user B cannot see / delete user A's keywords. Runs ONLY against the local
// Docker stack (supabase start). Treat as optional Wave-0 integration, not a gate
// (env-flaky per project memory). userClient(jwtA) inserts a keyword; userClient(jwtB)
// .select() returns [] and .delete().eq('id', kwA) affects 0 rows.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs`, cookie `get/set/remove` | `@supabase/ssr` `createClient` + `getAll`/`setAll` | established pre-Phase 19 | Already the project standard — just reuse `@/lib/supabase/server` |
| `auth.getUser()` for owner in actions | `auth.getClaims()` → `claims.claims.sub` | established in `categories.ts` | Use `getClaims()`; matches every existing action |

**Deprecated/outdated:** none relevant to this phase. No library version churn — all deps are current and locked.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Display the normalized keyword (lowercase/accent-stripped) directly in the chip with no "you typed X, saved Y" message | Pattern 5 / UI-SPEC | Low — explicitly LOCKED in UI-SPEC §Normalization display rule; user already approved |
| A2 | Pre-check select + 23505 backstop is the right duplicate strategy (vs constraint-only) | Standard Stack / Pattern 2 | Low — mirrors the documented 23503 backstop in `deleteCategory`; either path yields the same UX |
| A3 | Grouped RSC select + JS Map (not a join/view/second-count-query) is the chosen fetch shape | Pattern 4 | Low — Claude's-discretion per CONTEXT.md; chosen to mirror existing `txCountByCategory` |
| A4 | Live cross-user RLS test is OPTIONAL (structural assertion is sufficient for the KW-06 gate) | Validation / Pitfall 5 | Medium — if the planner wants a hard live-RLS gate, add `tests/category-keywords-rls.test.ts` and accept the env-flakiness; recommend keeping it optional |

**Note:** A1–A3 are effectively user-confirmed via the LOCKED CONTEXT/UI-SPEC; A4 is a test-strategy judgment the planner may override.

## Open Questions (RESOLVED)

1. **Should the dialog keep a local optimistic copy of the chip list for instant feedback, or rely solely on `revalidatePath` re-render?**
   - What we know: UI-SPEC explicitly leaves this to Claude's discretion ("as long as the persisted source of truth is the server").
   - **RESOLVED: `revalidatePath`-only** (simplest, matches `categoria-form.tsx`). Add optimistic removal only if the round-trip feels laggy; the input clear+refocus already gives immediate add feedback. Non-blocking discretion item; adopted in 19-02.

2. **Filename of the new dialog/action.**
   - What we know: CONTEXT marks names as Claude's discretion.
   - **RESOLVED: suggested kebab-case names** — `category-keywords-dialog.tsx`, `category-keywords.ts`, `category-keyword.ts` — for consistency with `src/components`/`src/actions`/`src/lib/schemas`. Adopted in both plans.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `supabase` CLI | migration `0036` + `gen:types` | ✓ (dev dep) | 2.106.0 | — |
| Local Docker Supabase (`supabase start`) | live RLS integration test (optional) | assumed ✓ (used by existing `tests/**`) | — | Skip live test; rely on mocked unit tests (KW-06 structural) |
| Vitest | unit + integration tests | ✓ | 4.1.9 | — |
| Node / Next 16 build | typecheck after gen:types | ✓ | next 16.2.9 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Local Docker stack for the live RLS test — fallback is the mocked unit suite + structural KW-06 assertion (recommended primary anyway).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 |
| Config file | `vitest.config.ts` (jsdom, globals, `@`→`./src` alias, `server-only`→no-op, setup `./vitest.setup.ts`) |
| Quick run command | `npx vitest run src/actions/category-keywords.test.ts` |
| Full suite command | `npm test` (= `vitest run`; includes `src/**/*.test.{ts,tsx}` + `tests/**/*.test.ts`) |

Test split (established): **mocked action unit tests** live in `src/**/*.test.ts` (mock `@/lib/supabase/server`); **live-Docker integration/RLS tests** live in `tests/**/*.test.ts` using `tests/helpers/local-supabase.ts` (`readLocalConfig`/`serviceClient`/`userClient`). Component tests are `src/components/*.test.tsx` (Testing Library + jsdom). [VERIFIED: vitest.config.ts, file listing]

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KW-01 | `addKeyword` inserts with owner + normalized keyword + revalidate | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t add` | ❌ Wave 0 |
| KW-01 | `addKeyword` normalizes input (raw → normalized payload) | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t normaliz` | ❌ Wave 0 |
| KW-01 | empty / whitespace / normalizes-to-'' → "Informe uma palavra-chave." (no insert) | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t empty` | ❌ Wave 0 |
| KW-01 | too-long (>60) rejected by Zod (no insert) | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t long` | ❌ Wave 0 |
| KW-01 | duplicate → `{duplicate:true}` via pre-check AND via 23505 backstop (no error) | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t duplicate` | ❌ Wave 0 |
| KW-01 | `removeKeyword` deletes by id + revalidate | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t remove` | ❌ Wave 0 |
| KW-06 | non-UUID `categoryId`/`keywordId` rejected before DB (WR-06) | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t uuid` | ❌ Wave 0 |
| KW-06 | session gate: no `claims.sub` → "Sessão expirada." | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t session` | ❌ Wave 0 |
| KW-06 | insert payload carries `user_id` (the `with check` half) | unit (mocked) | `npx vitest run src/actions/category-keywords.test.ts -t owner` | ❌ Wave 0 |
| KW-06 | cross-user: B cannot select/delete A's keyword (RLS) | integration (live Docker, OPTIONAL) | `npx vitest run tests/category-keywords-rls.test.ts` | ❌ Wave 0 (optional) |
| KW-01 (UI) | dialog renders chips, Empty when 0, add/remove call actions + toast | component (optional) | `npx vitest run src/components/category-keywords-dialog.test.tsx` | ❌ Wave 0 (optional) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/actions/category-keywords.test.ts` (mocked unit, <2s)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full mocked suite green; live RLS test green IF the local stack is up (otherwise structural KW-06 assertions in the unit suite are the gate — see Pitfall 5).

### Wave 0 Gaps
- [ ] `src/actions/category-keywords.test.ts` — covers KW-01 + KW-06 (structural) — mirror `src/actions/categories.test.ts`
- [ ] `tests/category-keywords-rls.test.ts` — covers KW-06 live isolation (OPTIONAL) — mirror `tests/category-idor.test.ts` + `tests/helpers/local-supabase.ts`
- [ ] `src/components/category-keywords-dialog.test.tsx` — covers dialog behavior (OPTIONAL) — mirror `src/components/receita-row-actions.test.tsx`
- [ ] Framework install: none — Vitest already configured.

## Security Domain

> `security_enforcement` not explicitly false in config → included. Financial-data isolation is the project's non-negotiable.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getClaims()` session gate in every action ("Sessão expirada." if no sub) |
| V3 Session Management | no | Handled by `@supabase/ssr` middleware (out of phase scope) |
| V4 Access Control | yes | Postgres RLS `(select auth.uid()) = user_id` `for all` + `user_id` set on insert (KW-06); WR-06 UUID guard on row ids (IDOR defense-in-depth) |
| V5 Input Validation | yes | Zod `keywordSchema` (trim/min1/max60) + `idSchema` UUID at the action boundary; `normalizeDescriptor` strips noise |
| V6 Cryptography | no | No secrets/crypto in this phase |

### Known Threat Patterns for Next.js + Supabase (this phase)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user keyword read/write (broken object-level auth, KW-06) | Information Disclosure / Elevation | RLS `auth.uid()=user_id` `using`+`with check`; action sets `user_id` from `getClaims()` |
| IDOR via forged `categoryId`/`keywordId` | Tampering / Elevation | `idSchema` UUID guard (WR-06); RLS makes a foreign id a no-op delete/select. Note: a forged `category_id` FK target is globally satisfiable (see `tests/category-idor.test.ts`) — but for `category_keywords` the `with check (auth.uid()=user_id)` blocks inserting against another user's row, and the keyword is meaningless without that user's transactions; no extra ownership pre-check needed beyond the existing RLS for THIS phase (Phase 20 matching is where category ownership matters) |
| Raw DB error leakage (23505/22P02/23502) | Information Disclosure | Map to friendly pt-BR messages; never return `error.message` (mirrors `deleteCategory` 23503 handling) |
| Injection via keyword text | Tampering | Parameterized via supabase-js (no string SQL); `normalizeDescriptor` + Zod constrain content; substring matching is Phase 20 and uses `descriptor_norm`, not user-built SQL |

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/0002_categories.sql` — exact RLS-own table template (enable RLS, grants, `(select auth.uid())=user_id` policy, user_id index) [VERIFIED: codebase grep]
- `supabase/migrations/0021_merchant_patterns.sql` — per-user FK-to-categories + column-list `unique` precedent [VERIFIED: codebase grep]
- `src/actions/categories.ts` — server-action canon (Zod boundary, getClaims, idSchema/WR-06, discriminated result, revalidatePath, 23503 friendly-error backstop) [VERIFIED: codebase grep]
- `src/actions/categories.test.ts` — mocked-action unit-test harness (makeBuilder/supabaseMock) [VERIFIED: codebase grep]
- `src/lib/schemas/category.ts` — Zod schema pattern (trim/min1/max60) [VERIFIED: codebase grep]
- `src/lib/normalize.ts` (+ `normalize.test.ts`) — `normalizeDescriptor`, the single key derivation; `''` sentinel for empty input [VERIFIED: codebase grep]
- `src/app/(app)/categorias/page.tsx` — RSC fetch + JS-Map grouping precedent (`txCountByCategory`) [VERIFIED: codebase grep]
- `src/components/category-row-actions.tsx` — menu + controlled-dialog insertion point [VERIFIED: codebase grep]
- `src/components/categoria-form.tsx` — controlled-dialog + useTransition + toast skeleton [VERIFIED: codebase grep]
- `src/components/category-filter.tsx:106-122` — verbatim removable-chip recipe [VERIFIED: codebase grep]
- `src/types/database.types.ts:205-240` — how a table surfaces (categories Row/Insert/Update) after gen:types [VERIFIED: codebase grep]
- `package.json` — `gen:types`/`db:push` scripts, Vitest 4.1.9, zero new deps needed [VERIFIED: codebase grep]
- `vitest.config.ts` + `tests/category-idor.test.ts` + `tests/helpers/local-supabase.ts` — test split + live-RLS pattern [VERIFIED: codebase grep]
- `19-CONTEXT.md`, `19-UI-SPEC.md`, `.planning/REQUIREMENTS.md` (KW-01/KW-06) — locked decisions + design contract [CITED]

### Secondary (MEDIUM confidence)
- Project memory (`dev-env-testing-gotchas`, `gsd-execution-gotchas`) — pre-commit rewrites `database.types.ts`; Supabase integration tests env-flaky; PROD wiped [CITED: MEMORY.md]

### Tertiary (LOW confidence)
- none — every claim is grounded in a read file or the locked CONTEXT/UI-SPEC.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all versions read from `package.json`
- Migration/schema: HIGH — adapted line-by-line from two existing migrations
- Server actions: HIGH — direct mirror of `categories.ts` (verified)
- UI: HIGH — UI-SPEC is an approved 6/6 contract; chip/dialog recipes verified in source
- Pitfalls: HIGH — derived from actual code + project memory
- Validation: HIGH — test framework + split verified in `vitest.config.ts` and file listing

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (stable; no fast-moving deps. Re-confirm only if Next/Supabase/shadcn majors change.)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Table:** `public.category_keywords(id uuid pk, user_id uuid not null →auth.users on delete cascade, category_id uuid not null →public.categories(id) on delete cascade, keyword text not null, created_at timestamptz default now())`. RLS uniform shape mirroring `0002_categories.sql`: `enable row level security`; `grant select,insert,update,delete ... to authenticated, service_role`; policy "own category_keywords" `for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)`; index on `(user_id)` (and `(category_id)`).
- **keyword stored NORMALIZED** via `normalizeDescriptor` (same as `descriptor_norm`) so Phase 20 substring match is apples-to-apples; **display the normalized value**.
- **Unicidade:** `unique(user_id, category_id, keyword)` — no dup in same category (same term MAY exist in another category; cross-category conflict is Phase 20's "longest wins").
- **ON DELETE CASCADE** when the category is deleted (keyword is category-owned metadata; unlike `transactions` which use RESTRICT + reassignment).
- Migration `0036`. Schema change → `npm run gen:types` + commit `database.types.ts`.
- **Server actions** (`src/actions/category-keywords.ts`) mirroring `categories.ts`: `'use server'`, Zod `safeParse` boundary → `{error}|{ok:true}`, `getClaims()` owner, `idSchema` uuid (WR-06), `revalidatePath('/categorias')`. Normalize on save. Limits: trim, min 1, max 60. No regex/wildcard. Duplicate on add → friendly toast "já cadastrada" (no validation error), guaranteed by unique + pre-check. Actions: `addKeyword(categoryId, keyword)`, `removeKeyword(keywordId)`.
- **UI:** new "Palavras-chave (N)…" item in `CategoryRowActions` → dedicated Dialog (mirrors Editar/CategoriaForm). Inside: removable chips (Badge + ×) + input + "Adicionar". `useTransition` + sonner toast. **Persistência imediata por ação** (NOT batch), like `setKind`/`setColor`. Discreet count `(N)` from the server fetch. pt-BR copy per UI-SPEC.
- Scope: **CRUD only. NO matching/auto-classification** (Phase 20).

### Claude's Discretion
- Exact filename of the actions file / dialog component (e.g. `category-keywords-dialog.tsx`).
- Zod keyword schema location (likely `src/lib/schemas/category-keyword.ts` mirroring `category.ts`).
- Whether the per-category count comes from a second aggregated `select` or a join in the RSC.
- Test coverage: actions (add/remove/validation/RLS-owner) + component, following `categories.test.ts` and existing component-test patterns.

### Deferred Ideas (OUT OF SCOPE)
- Matching on upload, order memória→palavra-chave→IA, "longest wins", `source="palavra-chave"`, grid override — **Phase 20** (KW-02/03/04/05).
- Auto-suggesting keywords from confirmed patterns — KW-F1 (future).
- regex/wildcard matching — KW-F2 (future).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KW-01 | User adds/removes keywords on a category in `/categorias` (manual, editable CRUD) | `0036` migration (Pattern 1) + `addKeyword`/`removeKeyword` actions (Pattern 2) + Zod schema (Pattern 3) + RSC fetch (Pattern 4) + dialog/RowActions (Pattern 5); normalization via `normalizeDescriptor`; duplicate handling; immediate persist + `revalidatePath` |
| KW-06 | Keyword rules scoped by `user_id` + RLS (multi-user-ready) | RLS "own category_keywords" policy (`using`+`with check (select auth.uid())=user_id`) + `user_id` on insert from `getClaims()` + WR-06 UUID guards + optional live-RLS test mirroring `tests/category-idor.test.ts`; Security Domain V4 |
</phase_requirements>
