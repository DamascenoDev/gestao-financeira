# Phase 22: Sugestão de palavra-chave (inline + batch) - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 9 (3 NEW · 3 MODIFY · 3 test)
**Analogs found:** 9 / 9 (all exact or role-match; this is a pure composition phase over shipped v1.5/v1.6 assets)

> All line numbers below were re-verified against the live source this session (not just trusted from RESEARCH.md). Every analog exists in-repo; this phase adds ZERO new packages, ZERO schema, ZERO new shadcn primitives.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/actions/category-keywords.ts` (MODIFY: add `getKeywordSuggestions`, `approveKeywordSuggestions`) | action (server) | request-response (read mine+filter / batch insert) | `addKeyword` / `removeKeyword` in the SAME file | exact (same file conventions) |
| `src/components/keyword-suggestions-dialog.tsx` (NEW, name at discretion) | component (client) | request-response + event-driven (multi-select, session discard) | `src/components/category-keywords-dialog.tsx` | exact (mirror skeleton) |
| `src/components/keyword-inline-suggest.tsx` (NEW, optional split — may inline) | component (client) | request-response (popover → action) | `category-keywords-dialog.tsx` onSubmit + `import-review-table.tsx` chip row | role-match |
| `src/components/import-review-table.tsx` (MODIFY: mount inline control) | component (client) | event-driven (client state gate) | `InlineReviewCategoryCell` chip row (self, 977) + `classifyRow` (343-360) | exact (same file) |
| `src/app/(app)/categorias/page.tsx` (MODIFY: toolbar trigger) | route (RSC) | request-response (RSC render) | self header (92-97) + `CategoryRowActions` mount pattern | exact (same file) |
| `src/lib/classifier/keywords.ts` (REUSE, no edit) | utility (pure) | transform | `matchKeyword`/`compileRule` (self) | reuse verbatim |
| `src/actions/category-keywords.test.ts` (MODIFY: add 2 actions' tests) | test | — | self (`makeBuilder`/`supabaseMock` harness, 1-93) | exact |
| `src/components/keyword-suggestions-dialog.test.tsx` (NEW) | test | — | `category-keywords-dialog.test.tsx` (jsdom dialog) | role-match |
| inline control test (extend `import-review-table.test.tsx` or new) | test | — | `import-review-table.test.tsx` | role-match |

## Pattern Assignments

### `src/actions/category-keywords.ts` — add `getKeywordSuggestions()` (server action, read+filter+sort)

**Analog:** `addKeyword` in the same file (verified `src/actions/category-keywords.ts:43-95`) for the owner-gate + result-union shape; `matchKeyword`/`compileRule` for the filter.

**Imports already present in the file** (lines 1-8) — add nothing new but the candidate types:
```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { keywordSchema } from '@/lib/schemas/category-keyword'
import { normalizeKeyword } from '@/lib/normalize'
import { createClient } from '@/lib/supabase/server'
// ADD: import { compileRule, matchKeyword, type KeywordRule } from '@/lib/classifier/keywords'
```

**Owner-gate pattern to copy** (from `addKeyword`, lines 67-70) — RLS scopes every read/write; NEVER take `user_id` from the client:
```typescript
const supabase = await createClient()
const { data: claims } = await supabase.auth.getClaims()
const userId = claims?.claims.sub
if (!userId) return { error: 'Sessão expirada.' }
```

**RLS-scoped read pattern** — the repo convention is NO manual `.eq('user_id', …)`; RLS enforces it (confirmed in `categorias/page.tsx`). Read `merchant_patterns` (Row verified `database.types.ts:449-479`: `descriptor_norm, category_id, hit_count`), `category_keywords`, `categories`.

**Filter via `matchKeyword`** (verified signature `src/lib/classifier/keywords.ts:127-130` → `KeywordMatch | null`; build rules with `compileRule` 77-93 which returns `null` for `''` / literal-count-0). Exclude any pattern where `matchKeyword(p.descriptor_norm, rules) !== null`. Sort remaining by `hit_count` desc. Candidate shape `{ descriptorNorm, categoryId, categoryName, hitCount }`. **Do NOT re-normalize `descriptor_norm`** — it is already the normalized key (re-normalizing re-strips `*`, the documented landmine in `normalize.ts` / `keywords.ts:6-11`).

---

### `src/actions/category-keywords.ts` — add `approveKeywordSuggestions(items)` (server action, batch insert)

**Analog:** `addKeyword` per-item logic (lines 47-91) executed in a loop behind ONE owner-gate and ONE `revalidatePath`.

**Result-union convention to copy** (verified line 31):
```typescript
export type AddKeywordResult = { ok: true } | { duplicate: true } | { error: string }
// NEW (recommended):
export type ApproveSuggestionsResult = { ok: true; created: number; skipped: number } | { error: string }
```

**Per-item validation to mirror EXACTLY** (the four guards from `addKeyword`, lines 47-65) — never throw, `continue` + count `skipped` on any failure so one bad item never aborts the batch (UI-SPEC: "block that one row's approval, not the whole batch"):
```typescript
if (!idSchema.safeParse(item.categoryId).success) { skipped++; continue }      // line 47 guard (idSchema = z.string().uuid, line 40)
const parsed = keywordSchema.safeParse(item.keyword)                            // line 54 guard
if (!parsed.success) { skipped++; continue }
const normalized = normalizeKeyword(parsed.data)                               // line 58 — normalize ONCE, preserves `*`
if (normalized === '') { skipped++; continue }                                 // line 59
if (normalized.replace(/\*/g, '') === '') { skipped++; continue }              // line 63 — reject `*`/`**` catch-all
```

**Dedupe + insert to mirror** (lines 73-91): `maybeSingle` pre-check → skip if existing; `.insert({ user_id: userId, category_id, keyword: normalized })`; treat `error.code === '23505'` as a skip (race backstop), never leak. Then ONE `revalidatePath(CATEGORIAS_PATH)` (the `'/categorias'` const, line 33) AFTER the loop.

---

### `src/components/keyword-suggestions-dialog.tsx` (NEW — batch dialog, client)

**Analog:** `src/components/category-keywords-dialog.tsx` (read in full, 1-188) — mirror the controlled-open + `useTransition` + `sonner` + `Empty` skeleton.

**Skeleton to mirror** (verified):
- `'use client'`; `useTransition` + `isPending` (line 60); `React.useId()` for label ids (line 66, NOT a hardcoded id — duplicate id/htmlFor across rows breaks label association).
- Controlled props `{ open, onOpenChange }` (lines 32-37).
- `Dialog` > `DialogContent` > `DialogHeader`(`DialogTitle`/`DialogDescription`) … `DialogFooter className="mt-6"` with a `DialogClose render={<Button variant="outline">Fechar</Button>}` (lines 114-185).
- Empty branch: `<Empty><EmptyHeader><EmptyTitle>…</EmptyTitle><EmptyDescription>…` (lines 125-134) for the no-candidates state.
- Chip recipe: `<Badge variant="secondary" className="gap-1">` (line 138) for the category chip; `X` from `lucide-react` `className="size-3"` (line 147) for the session-only discard control.

**Action call + result branching to copy** (onSubmit, lines 96-111) — for the bulk "Aprovar selecionadas":
```typescript
startTransition(async () => {
  const r = await approveKeywordSuggestions(selected)
  if ('error' in r) { toast.error(r.error); return }
  // toast created/skipped count; remove approved rows from local state; keep dialog open
})
```

**New primitives this dialog adds (all already vendored — do NOT re-add):** `Checkbox` (`ui/checkbox.tsx`, multi-select), `Select` (per-candidate category edit — copy the `Select`/`SelectItem`+`CategoryBadge` grammar from `import-review-table.tsx:961-970`). Discard = pure local-state removal, **NO server call** (Pitfall 5 — never wire to `removeKeyword`).

---

### `src/components/keyword-inline-suggest.tsx` (NEW or inlined — KW-07 control)

**Analog:** `category-keywords-dialog.tsx` onSubmit (96-111) for the action call; `import-review-table.tsx` chip row (977) for placement geometry; `ui/popover.tsx` for the edit shell.

**Salvar handler to copy** (mirrors onSubmit, branches on `addKeyword`'s union):
```typescript
function onSaveKeyword(term: string) {
  const normalized = normalizeKeyword(term.trim())            // echo in toast = stored value
  startTransition(async () => {
    const r = await addKeyword(row.category_id!, term)        // category the user JUST picked
    if ('error' in r) { setFieldError(r.error); return }      // keep popover open, FieldError
    if ('duplicate' in r) toast.info(`"${normalized}" já está cadastrada.`)
    else toast.success(`"${normalized}" adicionada a ${categoryName}.`)
    markCreated(row.id)                                       // flip to "criada ✓" (session Set<rowId>)
    closePopover()
  })
}
```

**Reuses `addKeyword` VERBATIM** (`src/actions/category-keywords.ts:43-95`) — no new action for inline. Popover field uses `Field`/`FieldLabel`/`FieldError` + `Input maxLength={60}` (same as dialog, lines 154-173). Prefill = the row's `descriptor_norm`, editable.

---

### `src/components/import-review-table.tsx` (MODIFY — mount inline control, gated)

**Analog:** self. Insertion point is the chip's existing reserved row (verified `src/components/import-review-table.tsx:977`):
```typescript
<div className="flex flex-wrap items-center gap-1">
  <ProvenanceBadge row={row} />
  {row.category_id === null ? (<SuggestionSlot … />) : null}
  <ConfidenceTag row={row} />
  {/* ADD HERE: {row.origin === 'manual' ? <KeywordInlineSuggest row={row} … /> : null} */}
</div>
```

**The gate (LOCKED):** `row.origin === 'manual'`. The `origin` union is `'memória' | 'palavra-chave' | 'manual' | 'não classificada'` (verified type, line 227) — there is **NO `'IA'` member**. `classifyRow` sets `origin: 'manual'` on any manual pick OR applied AI suggestion (verified 343-360). So `=== 'manual'` is the exact and only correct gate (Pitfall 1). Adds NO new column; sits flush with `ProvenanceBadge`/`ConfidenceTag` (reuse `min-h-5` pill geometry). "criada ✓" tracked in a session-scoped `Set<rowId>` in component state.

---

### `src/app/(app)/categorias/page.tsx` (MODIFY — toolbar trigger)

**Analog:** self header (verified 92-97) + the `CategoryRowActions` client-owns-open-state mount pattern (verified `src/components/category-row-actions.tsx:47-94`).

**Header row to extend** (lines 94-97):
```tsx
<div className="flex items-start justify-between gap-4">
  <h1 className="text-xl font-semibold">Categorias</h1>
  <CategoriaForm />
  {/* ADD: a client component that owns its own open state + renders the dialog,
      exactly like CategoryRowActions owns editOpen/keywordsOpen/deleteOpen (lines 47-49)
      and mounts <CategoryKeywordsDialog open={…} onOpenChange={…} /> (89-94). */}
</div>
```
The trigger button uses the existing "Nova categoria" (`CategoriaForm`) variant family — NOT a primary gold CTA (UI-SPEC §Color: don't compete with the page's existing affordance).

---

### `src/actions/category-keywords.test.ts` (MODIFY — test the 2 new actions)

**Analog:** self (`makeBuilder`/`supabaseMock` harness, verified 1-93). Copy verbatim: per-table builder capturing `{ from, op, payload, filters }` (24-29), settable `dupPreCheckResult` for the `maybeSingle` dup pre-check (34, 63), `insertResult` with a 23505 variant (31, 51-56), `claimsSub` toggle for the owner/session gate (35, 74-79), `next/cache` mock asserting `revalidatePath` (17-20). Use the REAL `normalizeKeyword`/`matchKeyword` (line 89 — NOT mocked) and real UUIDs (`CAT_ID`, 92).

**Assert:** `getKeywordSuggestions` excludes already-covered descriptors, sorts by `hit_count` desc, returns the `{ descriptorNorm, categoryId, categoryName, hitCount }` shape; `approveKeywordSuggestions` owner-gates ONCE, dedupes → `skipped`, calls `revalidatePath` ONCE, and a single bad/dup item never aborts the batch.

---

## Shared Patterns

### Server-action result discrimination (LOCKED repo convention)
**Source:** `src/actions/category-keywords.ts:29-31`
**Apply to:** both new actions. Actions never throw to the client; return a discriminated union, caller branches with `'error' in r` / `'duplicate' in r`.
```typescript
export type AddKeywordResult = { ok: true } | { duplicate: true } | { error: string }
```

### Owner-gate + RLS-scoped data access (V4 Access Control — load-bearing)
**Source:** `src/actions/category-keywords.ts:67-70`
**Apply to:** every read/insert in both new actions.
```typescript
const supabase = await createClient()
const { data: claims } = await supabase.auth.getClaims()
const userId = claims?.claims.sub
if (!userId) return { error: 'Sessão expirada.' }
// reads/inserts carry NO manual user_id filter — RLS (auth.uid() = user_id) enforces scope;
// inserts pass user_id: userId for the with-check half of the policy.
```

### Zod + normalize boundary (V5 Input Validation)
**Source:** `src/actions/category-keywords.ts:47-65` + `src/lib/schemas/category-keyword.ts:13-17`
**Apply to:** every term the client sends (inline AND every batch item — edited terms are client-supplied, re-validate server-side). `idSchema = z.string().uuid` (line 40) on every `categoryId`; `keywordSchema` (trim/min1/max60); `normalizeKeyword` once (preserves `*`); reject `''` and literal-count-0 (`*`/`**`).

### useTransition + sonner + useId (client UI)
**Source:** `src/components/category-keywords-dialog.tsx:60, 66, 96-111`
**Apply to:** both new client components. `const [isPending, startTransition] = useTransition()`; disabled pending button with its pending label ("Salvando…" / "Aprovando…"); `React.useId()` for label ids; `sonner` `toast.success`/`toast.info`/`toast.error`.

### Client-owns-its-own-open-state dialog mount
**Source:** `src/components/category-row-actions.tsx:47-94`
**Apply to:** the `/categorias` toolbar trigger — a small client component holds `useState(false)` and renders `<Dialog open onOpenChange>`, so `page.tsx` stays an RSC.

## No Analog Found

None. Every target file has a verified in-repo analog. The only genuinely new logic is (a) `getKeywordSuggestions` candidate computation and (b) the `approveKeywordSuggestions` loop — both are thin compositions of existing unit-tested helpers (`matchKeyword`/`compileRule`/`normalizeKeyword` + `addKeyword`'s own per-item logic).

## Metadata

**Analog search scope:** `src/actions/`, `src/components/`, `src/app/(app)/categorias/`, `src/lib/classifier/`, `src/lib/schemas/`
**Files scanned/read this session:** `category-keywords.ts`, `category-keywords.test.ts`, `keywords.ts`, `category-keyword.ts` (schema), `category-keywords-dialog.tsx`, `category-row-actions.tsx`, `import-review-table.tsx` (target ranges), `categorias/page.tsx` (header)
**Pattern extraction date:** 2026-06-20
