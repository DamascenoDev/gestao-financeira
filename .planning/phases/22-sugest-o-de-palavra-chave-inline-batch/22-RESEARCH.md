# Phase 22: Sugestão de palavra-chave (inline + batch) - Research

**Researched:** 2026-06-20
**Domain:** Next.js 16 App Router server actions + client UI over an EXISTING Supabase schema (no new tables, no AI, no external packages)
**Confidence:** HIGH — every claim below was verified by reading the cited source files in this session; this phase adds zero new dependencies and zero new network surface, so there was nothing to look up externally.

## Summary

Phase 22 is a pure composition phase over assets already built and shipped in v1.5/v1.6. It delivers two opt-in surfaces that turn already-confirmed signals into `category_keywords` rows — never auto-creating anything. **Inline (KW-07):** a discreet per-row "+ palavra-chave" pill in the import review grid, shown ONLY on rows the user classified by hand (`origin === 'manual'`), that opens a small popover prefilled with the row's `descriptor_norm` and calls the EXISTING `addKeyword(categoryId, keyword)` action. **Batch (KW-08):** a global dialog on `/categorias` that lists candidate keywords mined from confirmed `merchant_patterns`, excluding any descriptor already covered by an existing keyword (filtered server-side via the EXISTING `matchKeyword`), ordered by `hit_count` desc, with multi-select bulk approve and session-only discard.

The entire backbone already exists: `addKeyword` (Zod boundary, `normalizeKeyword`, owner-gate via `getClaims`, duplicate-as-friendly-no-op, unique-constraint backstop, `revalidatePath('/categorias')`); `matchKeyword`/`compileRule` (the substring+glob matcher); `normalizeKeyword` (preserves `*`); the `category-keywords-dialog.tsx` skeleton to mirror; and the `merchant_patterns` + `category_keywords` tables with RLS already in place. **No migration and no `gen:types` are needed** — verified: this phase touches no schema.

**Primary recommendation:** Reuse `addKeyword` verbatim for the inline path. For batch, add ONE new server action `approveKeywordSuggestions(items)` in `category-keywords.ts` that loops `addKeyword`'s exact validation/dedupe logic over N items behind a single `getClaims` owner-gate and a single `revalidatePath`, returning `{ created, skipped }` counts. Compute candidates in a dedicated server action (`getKeywordSuggestions()`) invoked on dialog open — NOT in the `/categorias` RSC fetch — so the page's first paint is not taxed by the `merchant_patterns` × `category_keywords` join + filter for a feature the user may never open.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inline affordance gating (manual rows only) | Browser / Client (`import-review-table.tsx`) | — | `origin` is already tracked in client state by `classifyRow`; gating is a pure render condition. No server involvement. |
| Inline keyword creation | API / Server Action (`addKeyword`) | — | Owner-gate + RLS write must run server-side. Reused verbatim. |
| "criada ✓" per-row state | Browser / Client | — | Session-scoped UI flag; UI-SPEC says it need not survive reload. |
| Candidate computation (mine + filter) | API / Server Action (new `getKeywordSuggestions`) | Database (RLS-scoped reads of `merchant_patterns`, `category_keywords`, `categories`) | Must read RLS-scoped tables under the caller's session; `matchKeyword` filter runs server-side per CONTEXT/UI-SPEC. |
| Batch approve | API / Server Action (new `approveKeywordSuggestions`) | Database (RLS-scoped `category_keywords` inserts) | One owner-gate, one `revalidatePath`, N inserts. |
| Discard | Browser / Client | — | Session-only local-state removal; explicitly NO persistence (no `dismissed` table). |
| Candidate list / multi-select / edit-before-approve UX | Browser / Client (new dialog component) | — | Pure UI composition over vendored shadcn primitives. |

**Why this matters:** The single most likely misassignment here is putting the "already-covered" filter in the client (shipping all `merchant_patterns` to the browser and filtering there). CONTEXT.md and UI-SPEC both LOCK this as a server-side `matchKeyword` filter — keep it on the server so raw merchant data never crosses to the client and the candidate list arrives pre-filtered.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Inline — placement & trigger (KW-07)**
- The action lives **per-row, inline in the review grid** (`import-review-table.tsx`): a discreet "+ palavra-chave" control next to the category cell. Mirrors the existing per-row affordances.
- Appears **only when the user manually picks/overrides the category** (origin `manual`). Rows already classified by memory/keyword/AI do NOT show the control — the descriptor is already learned/covered, so offering a keyword there is noise.
- Prefilled term is the **normalized `descriptor_norm`, editable** in a small popover before saving. Editing passes through the same `normalizeKeyword` (preserves `*`).
- The keyword is created **in the category the user just chose** for the row — no second question.

**Inline — persistence & feedback (KW-07)**
- Persists **immediately on click** (own server action), decoupled from "Confirmar importação" — opt-in, same as the Phase 19 keyword dialog. Creating the keyword does NOT commit the import nor write to `transactions`/`merchant_patterns`.
- **Reuses `addKeyword(categoryId, keyword)`** (`src/actions/category-keywords.ts`) — already validates (Zod), normalizes, dedupes, owner-gate + RLS + `revalidatePath`.
- Duplicate → **friendly "já cadastrada" toast** (mirrors Phase 19), no validation error.
- Feedback: **toast (sonner) + the inline control flips to "criada ✓"** (disabled) so it is not clicked twice in the same review session.

**Batch — analysis & candidates (KW-08)**
- Candidate source: **only confirmed `merchant_patterns`** (`descriptor_norm` → `category_id`) — the confirmed signal, per KW-08's text. Do NOT mine raw `transactions`.
- Filter: **exclude descriptors already covered by an existing keyword** (run `matchKeyword`/substring+glob against the user's current keywords) — no redundant suggestion. The rest become candidates.
- Suggested term: **the full `descriptor_norm`, editable before approving** — honest, no risky stemming heuristic; the user shortens it if they want.
- Ordering: **by `hit_count` desc** (most-used patterns first) — highest-value candidates at the top.

**Batch — approve/discard UX (KW-08)**
- Placement: **global dialog** opened by a "Sugerir palavras-chave" button on the `/categorias` toolbar (candidates cross categories → global, not per-category). Reuses the repo's Dialog pattern.
- Selection: **multi-select checkboxes + bulk "Aprovar selecionadas" action**; each candidate's category and term **editable** before approving. Approved become `category_keywords` (scoped by `user_id` + RLS).
- Discard is **session-only** — the discarded candidate leaves the list with no side effect (success-criterion 3 text), **no new "dismissed" table/column**. It may reappear in a future scan (acceptable; keeps the scope lean and the schema intact).
- Each candidate's category comes **prefilled from the pattern's category, editable** before approving.

### Claude's Discretion
- How to bulk-approve on the server: loop reusing `addKeyword` per candidate vs. a new batch action (`addKeywords`/`approveKeywordSuggestions`) that inserts N at once with a single owner-gate + `revalidatePath`. Prefer the batch action if the bulk UX is better; follow `category-keywords.ts` conventions.
- Where to compute candidates (server fetch in the `/categorias` RSC vs. a server action on dialog open) and the exact candidate-type shape (`{ descriptorNorm, categoryId, hitCount }`).
- Exact markup/naming of the components (e.g. `keyword-suggestions-dialog.tsx`, the inline control in `import-review-table.tsx`), badge/chip variants, and pt-BR copy.
- Test coverage: the candidate logic (already-covered filter, ordering, dedupe), the action(s) (validation, owner-gate, RLS, dedupe, batch), and the components (inline control appears only on manual; dialog approve/discard).

### Deferred Ideas (OUT OF SCOPE)
- Persisting discarded candidates ("don't suggest this again") — would require a new `dismissed` table/column; out of v1.6's lean scope. Discard stays session-only.
- Mining raw `transactions` (never-confirmed descriptors) as a candidate source — KW-08 restricts to confirmed `merchant_patterns`.
- Automatic derivation of a shorter token/stem for the suggested term — risky heuristic; keep the full editable `descriptor_norm`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KW-07 | Ao confirmar um padrão merchant→categoria na grid de revisão, o usuário recebe a opção **inline** de criar uma palavra-chave para aquele descritor (opt-in, sem criar automaticamente). | Inline control mounts in `InlineReviewCategoryCell` (`import-review-table.tsx` 891–1027) on the existing chip row (the `flex flex-wrap items-center gap-1` div at line 977), gated by `row.origin === 'manual'` (the value `classifyRow` sets at 344–360). Persistence reuses `addKeyword` verbatim (`category-keywords.ts` 43–95). NO change to `confirmImport` — verified. |
| KW-08 | Em `/categorias`, o usuário vê um painel que analisa padrões já confirmados (`merchant_patterns`) e sugere palavras-chave candidatas, aprovando ou descartando em lote. | New `getKeywordSuggestions()` server action reads `merchant_patterns` (Row shape verified: `database.types.ts` 449–479) joined to `categories`, filters via `matchKeyword` against the user's `category_keywords`, sorts by `hit_count` desc. New global dialog mirrors `category-keywords-dialog.tsx`. New `approveKeywordSuggestions(items)` action bulk-creates. Trigger button on `/categorias` header (`page.tsx` 92–97). |
</phase_requirements>

## Standard Stack

This phase introduces **ZERO new packages**. Every primitive, library, and helper it needs is already installed and in use. The "stack" is the in-repo asset inventory below.

### Core (existing, reused verbatim — do NOT rebuild)
| Asset | Path | Purpose | Verified Detail |
|-------|------|---------|-----------------|
| `addKeyword(categoryId, keyword)` | `src/actions/category-keywords.ts` 43–95 | Inline persistence + the unit of batch approve | `[VERIFIED: codebase]` Returns `{ ok: true } | { duplicate: true } | { error: string }`. Validates `idSchema` (uuid), `keywordSchema` (trim/min1/max60), `normalizeKeyword` once, rejects `''` and literal-count-0 (`*`/`**`), `getClaims().claims.sub` owner-gate, `maybeSingle` dup pre-check, 23505 race backstop, `revalidatePath('/categorias')`. |
| `removeKeyword(keywordId)` | `src/actions/category-keywords.ts` 98–116 | (Not needed this phase, but shares the file conventions to mirror) | `[VERIFIED: codebase]` |
| `matchKeyword(descriptorNorm, rules)` | `src/lib/classifier/keywords.ts` 127–165 | The "already-covered" batch filter | `[VERIFIED: codebase]` Pure/sync. Returns `KeywordMatch | null`. Substring for no-`*`, anchored ReDoS-safe glob for `*`. Most-specific-wins. |
| `compileRule(categoryId, keyword, sort)` | `src/lib/classifier/keywords.ts` 77–93 | Build the `KeywordRule[]` once for the filter | `[VERIFIED: codebase]` Returns `null` for `''` and literal-count-0. |
| `normalizeKeyword(raw)` | `src/lib/normalize.ts` 63–65 | Normalize edited terms (preserves `*`) | `[VERIFIED: codebase]` Same key space as `normalizeDescriptor` for non-wildcard input. |
| `keywordSchema` | `src/lib/schemas/category-keyword.ts` 13–17 | Validate raw term length | `[VERIFIED: codebase]` Bare string, trim/min1/max60. |
| `category-keywords-dialog.tsx` | `src/components/category-keywords-dialog.tsx` | Dialog skeleton to mirror for the batch dialog | `[VERIFIED: codebase]` Controlled `open`/`onOpenChange`, `useTransition`+`isPending`, `sonner`, `DialogHeader/Title/Description/Footer/Close`, `Field`/`FieldError`, `Empty`, `Badge variant="secondary"` chips, `useId` for label ids. |
| `merchant_patterns` table | migration `0021` · `database.types.ts` 449–479 | Candidate source | `[VERIFIED: codebase]` Row: `{ id, user_id, descriptor_norm, category_id, reserva_id, hit_count, last_used_at, created_at }`. `unique(user_id, descriptor_norm)`. RLS own. |
| `category_keywords` table | migration `0036` · `0037` widened CHECK | Write target | `[VERIFIED: codebase]` `unique(user_id, category_id, keyword)`. RLS own. |

### Supporting (existing UI primitives — all vendored, none re-added)
| Primitive | Path | Use |
|-----------|------|-----|
| `Popover` | `src/components/ui/popover.tsx` | Inline KW-07 edit popover |
| `Dialog` (+ Header/Title/Description/Footer/Close) | `src/components/ui/dialog.tsx` | Batch dialog shell |
| `Checkbox` | `src/components/ui/checkbox.tsx` | Batch multi-select |
| `Badge` | `src/components/ui/badge.tsx` | Suggested-term + category chips (`variant="secondary"`) |
| `Field`/`FieldLabel`/`FieldError` | `src/components/ui/field.tsx` | Popover input + inline validation |
| `Input` | `src/components/ui/input.tsx` | Editable term (`maxLength={60}`) |
| `Select` | (used in `import-review-table.tsx`) | Per-candidate editable category |
| `Empty` (+ Header/Title/Description) | `src/components/ui/empty.tsx` | No-candidates state |
| `Button` | `src/components/ui/button.tsx` | CTAs |
| `useTransition` / `sonner` | React / `sonner` | Pending state + toasts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `approveKeywordSuggestions` batch action | Loop `addKeyword` from the client per candidate | Client loop = N round-trips + N `revalidatePath` calls + N owner-gates; CONTEXT prefers a single batch action when bulk UX benefits. **Recommend the batch action.** |
| `getKeywordSuggestions()` server action on dialog open | Compute candidates in the `/categorias` RSC fetch | RSC compute taxes every `/categorias` paint with a join the user may never trigger. **Recommend the on-open action** (the dialog can show a brief pending state). |

**Installation:** None. `npm install` adds nothing this phase. No `npx shadcn add` (every primitive is already vendored — confirmed in UI-SPEC §Registry Safety). No `npm run gen:types` (no migration).

## Package Legitimacy Audit

> **Not applicable.** This phase installs zero external packages and adds zero new runtime dependencies. Every helper, action, and UI primitive it composes is already present in the repository (verified by reading the cited files). No registry lookup, no legitimacy gate, no `npm view` required.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
INLINE (KW-07) — import review grid (client state only until Confirmar)
┌────────────────────────────────────────────────────────────────────────┐
│ User picks/overrides a row's category                                    │
│   → classifyRow() sets origin='manual' in client state (line 344-360)    │
│        │                                                                  │
│        ▼                                                                  │
│   InlineReviewCategoryCell renders the chip row (line 977)               │
│        │  origin === 'manual'?  ── no ──► render nothing (memória/        │
│        │                                   palavra-chave rows stay quiet) │
│        ▼ yes                                                              │
│   "+ palavra-chave" pill ── click ──► Popover (prefill descriptor_norm)  │
│        │                                                                  │
│        ▼ Salvar                                                          │
│   addKeyword(row.category_id, editedTerm)  ──► SERVER ACTION             │
│        │   (Zod · normalizeKeyword · owner-gate · dedupe · RLS insert ·  │
│        │    revalidatePath('/categorias'))                               │
│        ▼                                                                  │
│   {ok}→toast + flip "criada ✓"   {duplicate}→toast.info + flip           │
│   {error}→keep popover open, FieldError                                  │
│   ✗ NO write to transactions / merchant_patterns / confirmImport         │
└────────────────────────────────────────────────────────────────────────┘

BATCH (KW-08) — /categorias global dialog
┌────────────────────────────────────────────────────────────────────────┐
│ "Sugerir palavras-chave" button (header) ── open ──► Dialog             │
│        │                                                                  │
│        ▼                                                                  │
│   getKeywordSuggestions()  ──► SERVER ACTION                             │
│      reads merchant_patterns  (RLS-scoped)                               │
│      reads category_keywords + categories.sort  (RLS-scoped)            │
│      build KeywordRule[] via compileRule                                  │
│      EXCLUDE any pattern where matchKeyword(descriptor_norm, rules)≠null │
│      sort remaining by hit_count desc                                     │
│      → Candidate[] { descriptorNorm, categoryId, categoryName, hitCount }│
│        │                                                                  │
│        ▼                                                                  │
│   Candidate list (checkbox · editable term · editable category · "N usos"│
│                   · discard X)                                            │
│      discard X → remove from local state (NO server write, session-only) │
│        │                                                                  │
│        ▼ "Aprovar selecionadas (N)"                                      │
│   approveKeywordSuggestions(selectedItems)  ──► SERVER ACTION           │
│      one getClaims owner-gate · per-item Zod+normalizeKeyword+dedupe ·   │
│      N RLS inserts · ONE revalidatePath('/categorias')                   │
│      → { created, skipped }                                              │
│        ▼                                                                  │
│   toast "{N} criadas · {M} já cadastradas" · remove approved rows        │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| File | New / Reused | Responsibility |
|------|-------------|----------------|
| `src/components/import-review-table.tsx` | EDIT | Add the inline "+ palavra-chave" control inside `InlineReviewCategoryCell` on the chip row (line 977), gated `row.origin === 'manual'`. Track per-row "criada ✓" in component state (keyed by `row.id`). |
| inline control (e.g. `keyword-inline-suggest.tsx`) | NEW (optional split) | The pill + popover + `addKeyword` call. May be inlined into `import-review-table.tsx` or extracted; Claude's discretion. |
| `src/actions/category-keywords.ts` | EDIT | Add `getKeywordSuggestions()` and `approveKeywordSuggestions(items)`. Reuse `addKeyword`'s validation primitives. |
| batch dialog (e.g. `keyword-suggestions-dialog.tsx`) | NEW | Mirror `category-keywords-dialog.tsx`; list + multi-select + edit + bulk approve + session discard. |
| `src/app/(app)/categorias/page.tsx` | EDIT | Add the "Sugerir palavras-chave" trigger in the header row (line 94–97), rendering the new dialog (client component owns its own open state, like `CategoryRowActions`). |

### Pattern 1: Server-action result discrimination (LOCKED repo convention)
**What:** Actions never throw to the client; they return a discriminated union and the caller branches with `'error' in r` / `'duplicate' in r`.
**When to use:** Both new actions.
**Example:**
```typescript
// Source: src/actions/category-keywords.ts (verified)
export type AddKeywordResult = { ok: true } | { duplicate: true } | { error: string }
// New batch result (recommended):
export type ApproveSuggestionsResult =
  | { ok: true; created: number; skipped: number }
  | { error: string }
```

### Pattern 2: Batch action = one owner-gate, N inserts, one revalidate
**What:** Resolve `getClaims().claims.sub` ONCE, validate+normalize each item with `addKeyword`'s exact rules, insert (dedupe via pre-check or 23505), `revalidatePath('/categorias')` ONCE at the end. Count `created` vs `skipped` (duplicates / per-item validation failures).
**When to use:** `approveKeywordSuggestions`.
**Example (shape — follow `addKeyword`'s logic per item):**
```typescript
// Source: derived from src/actions/category-keywords.ts addKeyword (verified)
export async function approveKeywordSuggestions(
  items: { categoryId: string; keyword: string }[],
): Promise<ApproveSuggestionsResult> {
  if (items.length === 0) return { ok: true, created: 0, skipped: 0 }
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  let created = 0, skipped = 0
  for (const item of items) {
    if (!idSchema.safeParse(item.categoryId).success) { skipped++; continue }
    const parsed = keywordSchema.safeParse(item.keyword)
    if (!parsed.success) { skipped++; continue }
    const normalized = normalizeKeyword(parsed.data)
    if (normalized === '' || normalized.replace(/\*/g, '') === '') { skipped++; continue }
    const { data: existing } = await supabase
      .from('category_keywords').select('id')
      .eq('category_id', item.categoryId).eq('keyword', normalized).maybeSingle()
    if (existing) { skipped++; continue }
    const { error } = await supabase.from('category_keywords')
      .insert({ user_id: userId, category_id: item.categoryId, keyword: normalized })
    if (error) { skipped++; continue } // 23505 race or other → count as skipped
    created++
  }
  revalidatePath('/categorias')
  return { ok: true, created, skipped }
}
```
> Note: per-item validation never aborts the whole batch (UI-SPEC: "block that one row's approval, not the whole batch"). A friendlier alternative is a single bulk `.insert([...rows])` with `onConflict` ignore, but the per-item loop is the faithful mirror of `addKeyword` and gives exact `created/skipped` counts for the toast. **Recommend the loop** for fidelity + counts.

### Pattern 3: Candidate computation + already-covered filter
**What:** Read `merchant_patterns`, build the user's keyword rule list, exclude any descriptor a rule already matches.
**Example:**
```typescript
// Source: derived from src/lib/classifier/keywords.ts (verified)
export type KeywordSuggestion = {
  descriptorNorm: string
  categoryId: string
  categoryName: string
  hitCount: number
}

export async function getKeywordSuggestions(): Promise<
  { ok: true; suggestions: KeywordSuggestion[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // RLS scopes all three reads to the caller — no manual user_id filter (repo convention).
  const [{ data: patterns }, { data: kws }, { data: cats }] = await Promise.all([
    supabase.from('merchant_patterns')
      .select('descriptor_norm, category_id, hit_count'),
    supabase.from('category_keywords').select('category_id, keyword'),
    supabase.from('categories').select('id, name, sort').eq('is_archived', false),
  ])

  const sortById = new Map((cats ?? []).map((c) => [c.id, c.sort]))
  const nameById = new Map((cats ?? []).map((c) => [c.id, c.name]))
  const rules = (kws ?? [])
    .map((k) => compileRule(k.category_id, k.keyword, sortById.get(k.category_id) ?? 0))
    .filter((r): r is KeywordRule => r !== null)

  const suggestions = (patterns ?? [])
    .filter((p) => matchKeyword(p.descriptor_norm, rules) === null) // exclude already-covered
    .map((p) => ({
      descriptorNorm: p.descriptor_norm,
      categoryId: p.category_id,
      categoryName: nameById.get(p.category_id) ?? p.category_id,
      hitCount: p.hit_count,
    }))
    .sort((a, b) => b.hitCount - a.hitCount) // hit_count desc

  return { ok: true, suggestions }
}
```

### Anti-Patterns to Avoid
- **Shipping raw `merchant_patterns` to the client and filtering there.** Filter server-side with `matchKeyword` (CONTEXT/UI-SPEC LOCK). Keep merchant data on the server.
- **Re-normalizing the descriptor or keyword in a cell/query.** `descriptor_norm` is already the normalized key; only the user's *edited* term goes back through `normalizeKeyword`. Re-normalizing a stored value re-strips `*` (the documented landmine — `normalize.ts` header).
- **Touching `confirmImport` for the inline path.** Inline create writes ONLY `category_keywords`. `confirmImport` stays the sole `transactions`/`merchant_patterns` writer (verified: `import.ts` ~955–990 is the only learn site).
- **Gating the inline control on an `'IA'`/`'ia'` origin value.** `ReviewRow.origin` has NO `'IA'` member — it is `'memória' | 'palavra-chave' | 'manual' | 'não classificada'` (verified, line 227). An AI suggestion that the user *applies* flips the row to `'manual'` (verified: `applyAllSuggestions` line 380 + `SuggestionSlot.onApply → onClassify`). So `origin === 'manual'` correctly captures "user hand-picked, including applying an AI guess" and correctly excludes memory/keyword rows. This is the right and only gate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Normalize an edited keyword | A new lowercase/strip routine | `normalizeKeyword` (`normalize.ts`) | Preserves `*`, same key space as descriptors; any reimplementation drifts the match key. |
| Decide if a descriptor is "already covered" | A custom `.includes()`/regex loop | `matchKeyword` + `compileRule` | Already handles substring AND glob, ReDoS-safe, most-specific-wins, literal-count-0 guard. |
| Validate / dedupe / owner-gate a keyword insert | New Zod + RLS plumbing | `addKeyword`'s exact logic (reuse for inline; mirror per-item for batch) | Duplicate-as-no-op, 23505 backstop, `getClaims` gate, uuid guard all already correct. |
| Keyword length/empty rules | New schema | `keywordSchema` + the `''`/literal-count-0 guards from `addKeyword` | Locked pt-BR messages already match UI-SPEC. |
| Dialog skeleton, chips, empty state, toasts | New dialog scaffolding | Mirror `category-keywords-dialog.tsx` | Controlled open, `useTransition`, `useId` labels, `Empty`, `Badge` chips, `sonner` — all solved. |

**Key insight:** This phase is ~90% wiring already-built pieces. The only genuinely new logic is (a) the candidate-computation function and (b) the batch-approve loop — both are thin compositions of existing, unit-tested helpers. Resist writing any new normalization, matching, or validation.

## Common Pitfalls

### Pitfall 1: Gating the inline control on the wrong origin
**What goes wrong:** Trying to gate on `'IA'`/`'ia'` (which doesn't exist) or on `category_id !== null` (which would show the control on memory/keyword rows too).
**Why it happens:** Mental model of "AI rows" that doesn't match the actual `origin` union.
**How to avoid:** Gate strictly on `row.origin === 'manual'`. Memory/keyword rows carry `'memória'`/`'palavra-chave'`; unclassified is `'não classificada'`. Applying an AI suggestion sets `'manual'`.
**Warning signs:** The pill appears on rows the user never hand-touched.

### Pitfall 2: Taxing `/categorias` first paint with the candidate join
**What goes wrong:** Computing candidates in the RSC means every `/categorias` load runs the `merchant_patterns` × `category_keywords` × `categories` read + filter, even for users who never open the panel.
**Why it happens:** RSC fetch feels "simpler" than wiring an action.
**How to avoid:** Compute in `getKeywordSuggestions()` invoked on dialog open (`useTransition` shows a brief pending). The page stays as fast as today.
**Warning signs:** `/categorias` TTFB regression after the phase.

### Pitfall 3: Batch approve aborting on the first bad/duplicate item
**What goes wrong:** A single `.insert([...])` that throws on the first 23505 (duplicate) loses the whole batch; or a per-item `throw` kills the loop.
**Why it happens:** Treating duplicates as errors instead of the friendly no-op the repo already uses.
**How to avoid:** Per-item `continue` on validation failure / existing / 23505, counting `skipped`; never throw. Mirror `addKeyword`'s "duplicate is a no-op" stance. Surface `{ created, skipped }` for the toast.
**Warning signs:** Approving 5 candidates where 1 is a dup creates 0 keywords.

### Pitfall 4: "criada ✓" state surviving where it shouldn't (or not at all)
**What goes wrong:** Persisting "criada ✓" across reloads (over-engineering) or losing it on re-render so the user double-creates.
**Why it happens:** Unclear scope of the flag.
**How to avoid:** Track a session-scoped `Set<rowId>` (or per-row boolean) in component state. UI-SPEC: it need not survive reload; it must survive re-renders within the session. The server's duplicate no-op is the real backstop against a double-create.

### Pitfall 5: Discard accidentally persisting
**What goes wrong:** Wiring discard to `removeKeyword` or any server call.
**Why it happens:** Reflex to "make it stick."
**How to avoid:** Discard is pure local-state removal — NO action call. CONTEXT/UI-SPEC LOCK it as session-only (no `dismissed` table). Reappearing on a future scan is accepted.

## Runtime State Inventory

> This phase adds NO schema and migrates NO stored data. It only *reads* existing state and *creates* new `category_keywords` rows through the already-shipped write path. The inventory is included for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Reads `merchant_patterns` (candidate source) and `category_keywords` (filter). Writes new `category_keywords` rows via `addKeyword`/batch. | None — no migration; writes go through the existing validated path. |
| Live service config | None — no external service, no AI provider call (this feature is non-AI). | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None — no new keys; no AI Gateway/BYOK use this phase. | None. |
| Build artifacts | None — no `gen:types` (no schema change); `database.types.ts` already carries `merchant_patterns`/`category_keywords` Row types (verified). | None — verified by reading `database.types.ts` 449–479. |

**Migration / `gen:types` needed?** **NO.** Verified: no new table or column. The schema-push gate stays OFF for this phase.

## Code Examples

All examples above (`approveKeywordSuggestions`, `getKeywordSuggestions`, inline `addKeyword` call) are derived directly from verified in-repo sources. One more — the inline call site:

### Inline KW-07 — Salvar handler
```typescript
// Source: pattern from src/components/category-keywords-dialog.tsx onSubmit (verified)
// Mounted inside InlineReviewCategoryCell, gated by row.origin === 'manual'.
function onSaveKeyword(term: string) {
  const normalized = normalizeKeyword(term.trim()) // echo in toast, matches stored value
  startTransition(async () => {
    const r = await addKeyword(row.category_id!, term) // category the user just picked
    if ('error' in r) { setFieldError(r.error); return }   // keep popover open
    if ('duplicate' in r) toast.info(`"${normalized}" já está cadastrada.`)
    else toast.success(`"${normalized}" adicionada a ${categoryName}.`)
    markCreated(row.id) // flip to "criada ✓" (session-scoped)
    closePopover()
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Keywords only via the per-category dialog (Phase 19) | + inline-from-grid (KW-07) and batch-from-patterns (KW-08) | This phase (v1.6 P22) | Two new opt-in entry points; the underlying model + match are unchanged. |

**Deprecated/outdated:** none relevant. (Repo-wide: `@supabase/auth-helpers-nextjs` is deprecated in favor of `@supabase/ssr` — already followed; not touched here.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Computing candidates in an on-open server action (not RSC) is the better default. | Pattern / Standard Stack | LOW — if first-open latency feels slow, switch to RSC prefetch; the candidate shape is identical either way (CONTEXT explicitly leaves this to discretion). |
| A2 | The per-item loop in `approveKeywordSuggestions` (vs a single bulk `.insert` with `onConflict`) is preferable for fidelity + exact counts. | Pattern 2 | LOW — both satisfy the contract; the loop is marginally more round-trips but mirrors `addKeyword` exactly and yields `created/skipped` for the toast. A bulk insert is a valid alternative if perf ever matters (candidate counts are small). |

**Note:** Both assumptions sit squarely inside CONTEXT.md's "Claude's Discretion" — they are recommendations, not unverified facts. No assumption affects compliance, security, or the locked decisions.

## Open Questions

1. **Exact candidate-row category editor: chip+`Select` of all categories, or chip-with-edit-on-click?**
   - What we know: UI-SPEC specifies "chip + editable `Select` of the user's categories, prefilled from the pattern."
   - What's unclear: whether to show the `Select` always or reveal on interaction (purely cosmetic).
   - Recommendation: always-visible `Select` styled as the prefilled category chip — simplest, matches the inline grid Select grammar; planner/executor decide final markup (UI-SPEC §Interaction permits it).

## Environment Availability

> **Skipped.** This phase has no external dependencies (no CLI tools, services, runtimes, databases, or network calls beyond the already-configured Supabase client). It is pure application code + server actions over existing schema.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (`vitest run`) + jsdom 29 for component tests `[VERIFIED: package.json]` |
| Config file | `vitest.config.ts` + `vitest.setup.ts` `[VERIFIED: codebase]` |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npm test` (`vitest run`) |

### Test Analogs (mirror these)
| New work | Analog test file | What to copy |
|----------|------------------|--------------|
| `approveKeywordSuggestions` / `getKeywordSuggestions` action tests | `src/actions/category-keywords.test.ts` | The `makeBuilder`/`supabaseMock` harness: per-table builder capturing `from/op/payload/filters`, settable `maybeSingle` (dup pre-check), `insertResult` with a 23505 variant, `claimsSub` toggle for the owner/session gate, `next/cache` mock asserting `revalidatePath`. REAL `normalizeKeyword`/`matchKeyword` (not mocked). |
| Candidate filter/sort/dedupe logic | `src/lib/classifier/keywords.test.ts` | Pure-function table tests over `matchKeyword`/`compileRule` (substring, glob, literal-count-0, most-specific). Reuse to assert the already-covered exclusion. |
| Inline control gating + popover | `src/components/import-review-table.test.tsx` | jsdom render of the grid; assert the pill renders only for `origin === 'manual'` rows and is absent for `'memória'`/`'palavra-chave'`/`'não classificada'`. |
| Batch dialog approve/discard | `src/components/category-keywords-dialog.test.tsx` | jsdom dialog interaction: open, select, edit, approve (action mocked), discard (assert NO action call). |
| Normalize edge cases (already covered) | `src/lib/normalize.test.ts` | Reuse; no new normalize logic this phase. |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KW-07 | Inline pill renders ONLY on `origin === 'manual'` rows; absent on memória/palavra-chave/não-classificada | component | `npx vitest run src/components/import-review-table.test.tsx` | ✅ extend |
| KW-07 | Salvar calls `addKeyword(row.category_id, term)`; success flips "criada ✓"; duplicate → toast.info + flip; error keeps popover open | component | `npx vitest run <inline-control>.test.tsx` | ❌ Wave 0 (new control test) |
| KW-07 | NO write to transactions/merchant_patterns/confirmImport from inline create | component/action | covered by mocked `addKeyword` (only `category_keywords` touched) + existing `import.test.ts` learn-only assertion | ✅ existing guards |
| KW-08 | `getKeywordSuggestions` excludes descriptors already covered by an existing keyword (via `matchKeyword`) | action/unit | `npx vitest run src/actions/category-keywords.test.ts` | ✅ extend |
| KW-08 | Candidates sorted by `hit_count` desc; shape `{ descriptorNorm, categoryId, categoryName, hitCount }` | action/unit | same file | ✅ extend |
| KW-08 | `approveKeywordSuggestions` creates RLS-scoped keywords; one owner-gate; one `revalidatePath`; dedupe → `skipped`; per-item validation never aborts the batch | action | same file | ✅ extend |
| KW-08 | Discard is side-effect-free (no server call) | component | `npx vitest run <batch-dialog>.test.tsx` | ❌ Wave 0 (new dialog test) |
| KW-07/08 | No auto-creation anywhere — keywords created only on explicit Salvar / Aprovar | component+action | the gating + opt-in tests above collectively cover this | ✅ via above |

### Sampling Rate
- **Per task commit:** `npx vitest run <the file(s) the task touches>` (e.g. the action test or the component test).
- **Per wave merge:** `npm test` (full Vitest run).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/components/<inline-control>.test.tsx` (or extend `import-review-table.test.tsx`) — covers KW-07 gating + Salvar/duplicate/error + "criada ✓".
- [ ] `src/components/<batch-dialog>.test.tsx` — covers KW-08 select/edit/approve/discard, discard = no server call.
- [ ] Extend `src/actions/category-keywords.test.ts` — add `getKeywordSuggestions` (filter/sort/shape) and `approveKeywordSuggestions` (owner-gate, dedupe→skipped, single revalidate, batch-not-aborted) using the existing `makeBuilder` harness.
- [ ] No framework install needed — Vitest + jsdom already configured.

## Security Domain

> `security_enforcement` is not present in config.json (treated as enabled). This phase writes financial-adjacent personal data (keywords that classify the user's spending), so access control is the load-bearing concern.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; reuses the session. |
| V3 Session Management | no | Reuses `@supabase/ssr` session; no change. |
| V4 Access Control | **yes** | `user_id` ALWAYS from `getClaims().claims.sub` (never the client) + RLS `auth.uid() = user_id` on `category_keywords`/`merchant_patterns`. Both new actions MUST owner-gate exactly as `addKeyword` does. RLS scopes every read/insert. |
| V5 Input Validation | **yes** | `idSchema` (uuid) on `categoryId`; `keywordSchema` (trim/min1/max60) + `normalizeKeyword` + empty/literal-count-0 reject on every term — for inline AND every batch item (client-supplied terms are edited, so re-validate server-side). |
| V6 Cryptography | no | No crypto in scope. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client forges a `categoryId` it doesn't own in the batch payload | Tampering / Elevation | RLS `with check (auth.uid() = user_id)` on the insert + the FK to the caller's `categories`; a foreign id inserts nothing. `idSchema` rejects non-uuid early. |
| Client submits an oversized/malicious term to bypass the dialog's `maxLength` | Tampering | Server re-runs `keywordSchema` (max60) + `normalizeKeyword` on EVERY item — never trust the client's edited term. |
| Catch-all keyword (`*`/`**`) that would match every descriptor | Tampering | `addKeyword`/batch reject literal-count-0; `compileRule`/`matchKeyword` also skip it (defense-in-depth). |
| Reading another user's `merchant_patterns` as candidates | Information Disclosure | RLS-scoped reads in `getKeywordSuggestions` (no manual `user_id` filter needed — RLS enforces it, matching the repo convention in `categorias/page.tsx`). |

## Sources

### Primary (HIGH confidence) — verified in-session by reading source
- `src/actions/category-keywords.ts` (1–117) — `addKeyword`/`removeKeyword` contract, owner-gate, dedupe, revalidate.
- `src/lib/classifier/keywords.ts` (1–165) — `matchKeyword`/`compileRule`/`globToRegExp`, `KeywordRule`/`KeywordMatch` types.
- `src/lib/normalize.ts` (1–103) — `normalizeKeyword`/`normalizeDescriptor`, `*`-preservation rule.
- `src/lib/schemas/category-keyword.ts` — `keywordSchema`.
- `src/components/category-keywords-dialog.tsx` — dialog skeleton to mirror.
- `src/components/import-review-table.tsx` — `ReviewRow` type (214–253, `origin` union at 227), `classifyRow` (344–360), `applyAllSuggestions` (370–380), `InlineReviewCategoryCell` (891–1027), chip row (977).
- `src/app/(app)/categorias/page.tsx` — RSC + header (92–97), RLS-scoped reads pattern.
- `src/components/category-row-actions.tsx` — client-owns-open-state dialog pattern.
- `supabase/migrations/0021_merchant_patterns.sql` + `src/types/database.types.ts` (449–479) — `merchant_patterns` shape + RLS.
- `src/actions/category-keywords.test.ts` (1–90) — the `makeBuilder`/`supabaseMock` harness.
- `package.json` / `vitest.config.ts` — test framework + scripts.
- `.planning/config.json` — `nyquist_validation: true`.
- `.planning/REQUIREMENTS.md` (13–14) — KW-07/KW-08 wording.
- `22-CONTEXT.md`, `22-UI-SPEC.md` — locked decisions + visual contract.

### Secondary / Tertiary
- None — no external sources consulted (no new dependencies, no schema, no AI).

## Metadata

**Confidence breakdown:**
- Standard stack (in-repo asset inventory): HIGH — every asset read and line-verified this session.
- Architecture (reuse map, action shapes): HIGH — derived directly from verified sources; the two discretionary choices are flagged as LOW-risk assumptions A1/A2.
- Pitfalls: HIGH — each pitfall is grounded in a verified code fact (e.g. the `origin` union has no `'IA'`; `confirmImport` is the sole learn site).

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable — depends only on in-repo code; re-verify line numbers if `import-review-table.tsx` or `category-keywords.ts` change before planning).
