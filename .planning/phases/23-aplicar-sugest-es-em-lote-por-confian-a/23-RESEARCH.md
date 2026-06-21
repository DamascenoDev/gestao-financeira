# Phase 23: Aplicar sugestões em lote por confiança - Research

**Researched:** 2026-06-21
**Domain:** Client-side React grid behavior (single-file relabel/regate) — no new tech, no server/schema/types
**Confidence:** HIGH

## Summary

Phase 23 is a **very small, single-file refinement** of an already-shipped affordance. The bulk-apply button in `src/components/import-review-table.tsx` today applies **every** unapplied IA suggestion in one click (regardless of confidence). CLSAI-10 changes the semantics so it applies **only suggestions at/above the existing `LOW_CONFIDENCE = 0.6` threshold**, leaving low-confidence rows untouched and uncategorized for per-row manual review. Nothing is committed — the fill is client-state only (`origin → 'manual'`, `reserva_id → null`), and `confirmImport` (the sole `merchant_patterns`/`transactions` write path) is **not touched**.

The edit surface is tiny and fully verified against live source (line numbers below all confirmed): (1) gate the `applyAllSuggestions` predicate with `&& r.suggestion.confidence >= LOW_CONFIDENCE`; (2) replace the `unappliedSuggestionCount` driver with a new `confidentSuggestionCount` (same predicate + the `>= LOW_CONFIDENCE` clause); (3) relabel the button to the LOCKED pt-BR copy "Aplicar {N} sugestões confiáveis" (singular "Aplicar 1 sugestão confiável"); (4) update the toast to "{N} sugestões confiáveis aplicadas" (singular "1 sugestão confiável aplicada"). The button stays hidden when the confident count is 0, even if low-confidence rows remain pending.

The "three sources" wording of CLSAI-10 (memória / palavra-chave / IA) is satisfied **trivially**: memória and palavra-chave arrive as pre-fill bindings at parse time (`category_id` already set + `origin`), so there is nothing "pending" for them — `ReviewRow.suggestion` is carried by IA only. This must be documented so the verifier does not look for a non-existent memória/keyword "pending apply" path.

**Primary recommendation:** Make the four micro-edits in `import-review-table.tsx`, fully replacing `unappliedSuggestionCount` (it is used nowhere else — verified by grep). Factor a single `isConfidentPending(row)` predicate to derive `confidentSuggestionCount` AND gate `applyAllSuggestions`, so the `>= LOW_CONFIDENCE` comparison lives in exactly one place (mirrors the existing `isLowConfidenceAi` helper). Update the existing `apply-all` test (it currently asserts "Aplicar 2 sugest" with a 0.9 + 0.3 fixture — that assertion BREAKS under the new gate) and add the confidence-gating cases. No Wave 0 — vitest + jsdom infra already covers this file.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Confidence-gated bulk apply | Browser / Client (React component state) | — | The apply is non-binding client grid state only; no network call. `setRows` mutates local state. |
| Threshold definition | Browser / Client (exported const) | — | `LOW_CONFIDENCE = 0.6` is a code constant in the same file; reused, no UI control (deferred). |
| Button label/visibility | Browser / Client (render) | — | Derived from `confidentSuggestionCount` over local `rows` state. |
| Toast feedback | Browser / Client (sonner) | — | Presentation-only; no persistence. |
| Persistence + learning (UNCHANGED) | API / Server Action | Database (RLS) | `confirmImport` remains the sole `merchant_patterns`/`transactions` write — explicitly OUT of scope. |

**Tier note:** Every change is in the Browser/Client tier. Zero API, schema, types, or migration changes — confirmed against CONTEXT.md, UI-SPEC.md, and live source.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Semântica do aplicar-em-lote (CLSAI-10):**
- **Modify the existing `applyAllSuggestions`** in `import-review-table.tsx` to apply only suggestions with `confidence >= limiar` — today's "apply all regardless of confidence" becomes "apply the confident ones". A single bulk action, NOT a second button.
- **Source = IA only.** memória and palavra-chave are pre-fill bindings already applied at parse (`category_id` set + origin badge) → there is nothing "pending" for them; the SC1 three-source wording is satisfied trivially (nothing pending for memória/keyword). Document explicitly so the verifier is not confused.
- **Rows below threshold stay untouched and uncategorized → pending for manual review** (SC2). They are exactly the rows already marked with the amber "baixa confiança" tag and sorted first.
- **No commit** (SC3): bulk-apply fills the category in CLIENT state only (origin → `manual`, `reserva_id` null), NEVER writes to the DB. merchant→categoria learning stays only in `confirmImport`, which remains **UNCHANGED** — identical to today's apply-all contract.

**Limiar:**
- **Reuse the existing constant `LOW_CONFIDENCE = 0.6`** as the threshold — the rows left pending are exactly today's amber "baixa confiança" set. Single source of truth, no new constant.
- **Threshold is a fixed code constant** (already "tunable" per CLSAI-08), **no UI control** (slider/input would be scope creep).
- **Boundary semantics:** `confidence >= LOW_CONFIDENCE` applies (confiável); `< LOW_CONFIDENCE` stays pending — consistent with the existing low-confidence tag (`< 0.6`).

**UX — affordance, copy, feedback:**
- **Count = only the confident pending ones** (above threshold); relabel the button to make the threshold explicit ("Aplicar N sugestões confiáveis"). Exact pt-BR copy fixed by ui-phase.
- **Visibility:** show only when there is ≥1 confident pending suggestion; hide when the confident count = 0 (even if low-confidence rows remain — those go to manual review). Mirrors today's hide-when-none.
- **Feedback:** toast with the applied count ("N sugestões confiáveis aplicadas"); low-confidence rows are already visually marked + sorted first and are per-row editable. Calm, no undo (nothing committed).

### Claude's Discretion
- Exact name/shape of the confident-count helper (e.g. derive `confidentSuggestionCount` alongside the existing `unappliedSuggestionCount`) and whether the "confident" predicate becomes a util shared with the low-confidence one (`confidence < LOW_CONFIDENCE`) to avoid duplicating the threshold.
- Exact pt-BR copy of the button and toast (within what 23-UI-SPEC fixes).
- Test coverage: the threshold predicate/count, the gated `applyAllSuggestions` (applies >=0.6, skips <0.6, leaves them pending with no category, origin→manual, no DB write), and button visibility/label. Mirror the existing CLSAI-08 tests in `import-review-table.test.tsx`.

### Deferred Ideas (OUT OF SCOPE)
- UI threshold control (slider/input) — out of scope; threshold stays a code constant.
- Synthetic confidence for memória/palavra-chave so they enter "pending" — rejected; they are already-applied bindings.
- Undo of bulk-apply — unnecessary (nothing committed; rows are editable and overwritable).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLSAI-10 | No review grid, o usuário pode aplicar de uma vez todas as sugestões pendentes (memória / palavra-chave / IA) cuja confiança esteja **acima de um limiar**, deixando as de baixa confiança para revisão manual. Sem auto-commit no upload — a ação é explícita do usuário. | Met by gating `applyAllSuggestions` with `confidence >= LOW_CONFIDENCE` (verified at `import-review-table.tsx:393-415`) + driving the button from a new `confidentSuggestionCount`. The "memória/palavra-chave" arm is satisfied trivially: those are pre-fill bindings (`category_id` set at parse, NOT pending) — only IA carries `ReviewRow.suggestion` (verified at `:261`). No-auto-commit invariant preserved: `confirmImport` untouched (`:670`), apply mutates client state only (`:393-415`). |
</phase_requirements>

## Standard Stack

No new dependencies. All primitives are already vendored and imported in the single target file.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | 19.x | Component state (`useState`/`useCallback`/`useMemo`) | Already the runtime; `applyAllSuggestions` is a `useCallback`, counts are plain derivations. |
| `@tanstack/react-table` | 8.21.x | Review grid | Already drives the table; no table API change this phase. |
| `lucide-react` | (vendored) | `Sparkles` icon | Already imported at `import-review-table.tsx:12`; button icon unchanged. |
| `sonner` | 2.0.x | Toast | Already imported at `:15`; single-arg string `toast(...)` reused. |

### Supporting
None new.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reuse `LOW_CONFIDENCE` as the threshold | New `APPLY_THRESHOLD` const | Rejected by CONTEXT.md — would split the threshold into two sources of truth and let the "confiável" set drift from the "baixa confiança" set. Reuse is locked. |
| Second "apply confident" button | New button | Rejected by CONTEXT.md — a single bulk action, relabeled, not a second control. |

**Installation:** None — no package changes.

**Version verification:** N/A — no packages added or upgraded this phase. (`npm view` not run because the dependency set is unchanged; this is a behavior edit to existing first-party code.)

## Package Legitimacy Audit

> Not applicable — this phase installs **no** external packages. No new imports, no `npm install`, no registry interaction. All primitives (`react`, `@tanstack/react-table`, `lucide-react`, `sonner`) are already present and unchanged.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Upload (CSV/OFX/PDF) ──parse──▶ ParsedReviewRow[]
                                   │  memória/palavra-chave hit ⇒ category_id SET + origin badge
                                   │  IA guess           ⇒ category_id NULL + suggestion{ categoryId, confidence, source:'ia' }
                                   ▼
                         ImportReviewTable (client state: rows)
                                   │
        ┌──────────────────────────┴───────────────────────────────┐
        ▼                                                            ▼
  derive confidentSuggestionCount                          render rows (grid)
  = rows.filter(isConfidentPending)                          • amber "baixa confiança" tag  (confidence < 0.6)  UNCHANGED
        │   isConfidentPending(r):                           • low-confidence-first sort                         UNCHANGED
        │     category_id === null                           • OriginBadge / SuggestionSlot                      UNCHANGED
        │     && suggestion?.categoryId != null
        │     && suggestion.confidence >= LOW_CONFIDENCE
        ▼
  Button (variant=outline, gold Sparkles)
  visible only when confidentSuggestionCount >= 1
  label: "Aplicar {N} sugestões confiáveis"
        │ onClick
        ▼
  applyAllSuggestions()  ── setRows: for each isConfidentPending(r) →
        │                     { category_id: suggestion.categoryId, reserva_id: null, origin:'manual' }
        │                   rows with confidence < 0.6 ⇒ LEFT UNTOUCHED (still null + pending)
        ▼
  toast("{N} sugestões confiáveis aplicadas")          ◀── NO DB write

   ── separately, on explicit human click ──▶ "Confirmar importação" ──▶ confirmImport()  [UNCHANGED — sole persist/learn path]
```

### Component Responsibilities
| File | Responsibility | Change this phase |
|------|----------------|-------------------|
| `src/components/import-review-table.tsx` | The whole review grid + bulk-apply | The ONLY production file changed — 4 micro-edits (see below) |
| `src/components/import-review-table.test.tsx` | Component tests (vitest + jsdom) | Update the `apply-all` test + add confidence-gating cases |
| `src/actions/import.ts` (`confirmImport`) | Persist + learn | **NO CHANGE** |
| `src/components/origin-badge.tsx`, `suggestion-slot.tsx` | Per-row provenance/suggestion chips | **NO CHANGE** |

### Pattern 1: Single-source threshold predicate (Claude's discretion — RECOMMENDED)
**What:** Factor a `isConfidentPending(row)` helper next to the existing `isLowConfidenceAi(row)` (`:193-199`) so the `>= LOW_CONFIDENCE` comparison appears once and is used by both the count derivation AND the `applyAllSuggestions` gate.
**When to use:** Always here — avoids duplicating the boundary `0.6` in three places (count, gate, and risking drift from the `< 0.6` tag predicate).
**Example:**
```typescript
// Source: mirror of existing isLowConfidenceAi at import-review-table.tsx:193-199 (live source)
/** CLSAI-10: true when the row is an unapplied AI suggestion at/above the threshold. */
function isConfidentPending(row: ReviewRow): boolean {
  return (
    row.category_id === null &&
    !!row.suggestion?.categoryId &&
    row.suggestion.confidence >= LOW_CONFIDENCE
  )
}
```
Then:
```typescript
// REPLACES unappliedSuggestionCount at :707-709
const confidentSuggestionCount = rows.filter(isConfidentPending).length

// Inside applyAllSuggestions (:396-407) — gate the map:
const next = prev.map((r) => {
  if (isConfidentPending(r)) {
    applied += 1
    return { ...r, category_id: r.suggestion!.categoryId, reserva_id: null, origin: 'manual' as const }
  }
  return r
})
```
*Note:* `isConfidentPending(r)` guarantees `r.suggestion.categoryId` is non-null, but TS strict still needs the existing narrowing. The current code already reads `r.suggestion?.categoryId != null` inline in the `if`; if you factor the predicate, use a non-null assertion (`r.suggestion!.categoryId`) or re-narrow inside the branch — match whatever the existing strict config accepts (the repo uses `noUncheckedIndexedAccess`; verify `tsc` passes).

### Pattern 2: Mirrored singular/plural ternary (LOCKED copy)
**What:** Reuse the exact `N === 1 ? singular : plural` shape already at `:410` and `:727`. No i18n library.
**Example:**
```typescript
// Button label (REPLACES :726-727)
Aplicar {confidentSuggestionCount}{' '}
{confidentSuggestionCount === 1 ? 'sugestão confiável' : 'sugestões confiáveis'}

// Toast (REPLACES :409-411)
toast(
  `${applied} ${applied === 1 ? 'sugestão confiável aplicada' : 'sugestões confiáveis aplicadas'}`,
)
```

### Anti-Patterns to Avoid
- **Adding a second button or a threshold slider:** explicitly deferred/rejected. Relabel the one button.
- **Introducing a new threshold constant:** reuse `LOW_CONFIDENCE`. Two constants = drift between "confiável" and "baixa confiança" sets.
- **Touching `confirmImport`, server actions, schema, types, or migrations:** all OUT of scope. The diff must be confined to `import-review-table.tsx` (+ its test).
- **Re-styling or re-sorting low-confidence rows:** the amber tag, the low-confidence-first sort, OriginBadge/SuggestionSlot must stay byte-identical (UI-SPEC §"Must stay byte-identical").
- **Synthesizing confidence for memória/keyword to make them "pending":** rejected — they are pre-applied bindings, never in the suggestion set.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Threshold comparison | A second inline `< 0.6` / `>= 0.6` literal | Reuse `LOW_CONFIDENCE` + factor `isConfidentPending` | Single source of truth; matches the existing `isLowConfidenceAi` pattern. |
| Pluralization | An i18n lib or a pluralize helper | The existing `N === 1 ? … : …` ternary | Codebase convention (`:410`, `:727`); locked by UI-SPEC. |
| Toast | A custom toast component | `sonner` `toast('…')` single-arg | Already imported and used identically at `:409`. |
| Count/visibility state | A new piece of `useState` | A plain derivation `rows.filter(isConfidentPending).length` | The existing `unappliedSuggestionCount` is a derivation, not state — mirror it. |

**Key insight:** This phase is almost entirely a *deletion-and-rename* of existing logic, not new construction. The lowest-risk path reuses every existing primitive and changes only the predicate clause + two strings + the count name.

## Common Pitfalls

### Pitfall 1: The existing `apply-all` test will go RED if not updated
**What goes wrong:** `import-review-table.test.tsx:265-300` renders a fixture with a 0.9 row and a 0.3 row and asserts the button reads `/Aplicar 2 sugest/i`. Under the new gate the 0.3 row is excluded, so the count becomes 1 and the label text changes to "sugestões confiáveis". The old assertions (`Aplicar 2 sugest`, "every per-row chip is gone") break.
**Why it happens:** The change deliberately alters the observable count and copy that this test pins.
**How to avoid:** Treat updating this test as part of the task, not an afterthought. The new expectation: only the 0.9 row applies; the 0.3 row's "Aplicar sugestão" chip REMAINS (still pending); the bulk button DISAPPEARS after click only because the single confident row is now applied. Add explicit cases for "low-confidence left pending + uncategorized" and "button hidden when 0 confident even with low-confidence rows remaining".
**Warning signs:** `vitest run` failing on the `apply-all` case — expected, fix the assertions to the new semantics.

### Pitfall 2: Boundary direction (`>=` vs `>`)
**What goes wrong:** CLSAI-10's prose says "acima de um limiar" (above a threshold), which colloquially reads as strictly `>`. The LOCKED decision is `>= LOW_CONFIDENCE` (so exactly 0.6 IS applied), to stay consistent with the existing "baixa confiança" tag predicate (`< 0.6`) — together they partition the space with no gap/overlap at 0.6.
**Why it happens:** Natural-language "above" vs. the locked inclusive boundary.
**How to avoid:** Use `>= LOW_CONFIDENCE` for apply/count and keep the tag's `< LOW_CONFIDENCE` untouched. Add a boundary test at exactly `0.6` asserting it APPLIES and shows NO "baixa confiança" tag.
**Warning signs:** A 0.6 row showing the amber tag (would mean someone changed the tag predicate) or a 0.6 row left pending (would mean `>` was used).

### Pitfall 3: TS strict narrowing on `r.suggestion.categoryId`
**What goes wrong:** If you factor `isConfidentPending` and then access `r.suggestion.categoryId` inside the `applyAllSuggestions` branch, TS strict does not carry the predicate's narrowing into the branch (a `boolean`-returning helper is not a type guard for `r.suggestion`).
**Why it happens:** `isConfidentPending(r): boolean` doesn't narrow `r.suggestion` to non-undefined the way the existing inline `if (r.category_id === null && r.suggestion?.categoryId != null)` does.
**How to avoid:** Either keep the inline predicate in the map (and only share the COUNT), or use `r.suggestion!.categoryId` inside the branch, or write `isConfidentPending` as a type guard (`row is ReviewRow & { suggestion: {...} }`). Run `tsc`/`npm run build` to confirm strict passes — this is a pre-commit gate in this repo.
**Warning signs:** `Object is possibly 'undefined'` on `r.suggestion` during typecheck.

### Pitfall 4: Forgetting `unappliedSuggestionCount` is fully dead after the change
**What goes wrong:** Leaving the old `unappliedSuggestionCount` derivation in place alongside the new one creates an unused binding (lint/`noUnusedLocals` may fail) or confuses the next reader.
**Why it happens:** Incremental editing.
**How to avoid:** Grep confirmed `unappliedSuggestionCount` is referenced ONLY at `:707, :719, :726, :727` — all inside this component, all being replaced. Delete it entirely and replace with `confidentSuggestionCount`. (Verified: no other file imports or references it.)

## Code Examples

### The minimal edit set (verified against live source 2026-06-21)
```typescript
// 1) ADD a shared predicate near isLowConfidenceAi (~:199):
function isConfidentPending(row: ReviewRow): boolean {
  return (
    row.category_id === null &&
    !!row.suggestion?.categoryId &&
    row.suggestion.confidence >= LOW_CONFIDENCE
  )
}

// 2) GATE applyAllSuggestions (:396-407) — apply only confident rows; toast copy (:409-411):
const next = prev.map((r) => {
  if (isConfidentPending(r)) {
    applied += 1
    return { ...r, category_id: r.suggestion!.categoryId, reserva_id: null, origin: 'manual' as const }
  }
  return r
})
// ...
toast(
  `${applied} ${applied === 1 ? 'sugestão confiável aplicada' : 'sugestões confiáveis aplicadas'}`,
)

// 3) REPLACE the count driver (:707-709):
const confidentSuggestionCount = rows.filter(isConfidentPending).length

// 4) RELABEL the button (:719-728) — visibility + label:
{confidentSuggestionCount > 0 ? (
  <Button type="button" variant="outline" onClick={applyAllSuggestions}>
    <Sparkles className="size-4" aria-hidden />
    Aplicar {confidentSuggestionCount}{' '}
    {confidentSuggestionCount === 1 ? 'sugestão confiável' : 'sugestões confiáveis'}
  </Button>
) : null}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bulk-apply applies ALL unapplied IA suggestions | Bulk-apply applies only `confidence >= 0.6` | This phase (23) | Low-confidence rows stay pending for manual review; threshold made explicit in the label copy. |

**Deprecated/outdated:**
- `unappliedSuggestionCount` (`:707`) — replaced by `confidentSuggestionCount`. Remove entirely.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (none) | — | All claims verified against live source, CONTEXT.md, UI-SPEC.md, REQUIREMENTS.md, or grep this session. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. (Every line number was read from `import-review-table.tsx` directly; `unappliedSuggestionCount` single-use was grep-confirmed; vitest jsdom config was read from `vitest.config.ts`; the LOCKED copy is taken verbatim from 23-UI-SPEC.md.)

## Open Questions

1. **Type-guard vs. non-null assertion for the shared predicate**
   - What we know: `isConfidentPending(r): boolean` won't narrow `r.suggestion` for the apply branch under TS strict.
   - What's unclear: Whether the planner prefers a typed guard (`row is ReviewRow & { suggestion: { categoryId: string; confidence: number; source: 'ia' } }`), a `!` assertion, or keeping the inline predicate in the map and sharing only the count.
   - Recommendation: Use a `!` assertion inside the branch (smallest diff, matches the existing inline `r.suggestion?.categoryId != null` intent) and confirm with `npm run build`/`tsc`. This is Claude's discretion per CONTEXT.md.

## Environment Availability

> Skipped — this phase is a code-only change to existing first-party React. No external tools, services, runtimes, or new packages. Test runner (`vitest run`) and the TS toolchain are already present and used by the existing `import-review-table.test.tsx`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (run mode) + @testing-library/react, jsdom environment |
| Config file | `vitest.config.ts` (`environment: 'jsdom'`, `setupFiles: ['./vitest.setup.ts']`) |
| Quick run command | `npx vitest run src/components/import-review-table.test.tsx` |
| Full suite command | `npm run test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLSAI-10 | Bulk apply fills ONLY rows with `confidence >= 0.6` (confident applied) | unit (component) | `npx vitest run src/components/import-review-table.test.tsx -t "confident"` | ✅ (extend) |
| CLSAI-10 | Rows with `confidence < 0.6` stay pending + uncategorized (chip remains, category null) | unit | same file | ✅ (extend) |
| CLSAI-10 | Boundary: a `0.6` row IS applied AND shows NO "baixa confiança" tag | unit | same file | ✅ (add) |
| CLSAI-10 | Button label reflects confident count + LOCKED copy ("Aplicar N sugestões confiáveis" / singular) | unit | same file | ✅ (update existing `apply-all`) |
| CLSAI-10 | Button HIDDEN when `confidentSuggestionCount === 0` even with low-confidence rows still pending | unit | same file | ✅ (add) |
| CLSAI-10 | Toast copy "N sugestões confiáveis aplicadas" / singular on apply | unit | same file (assert `toast` mock called with the string) | ✅ (add) |
| CLSAI-10 | NO write path: `confirmImport` never called by bulk-apply | unit | same file (`confirmImportMock).not.toHaveBeenCalled()`) | ✅ (mirror existing) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/components/import-review-table.test.tsx`
- **Per wave merge:** `npm run test` (full vitest suite)
- **Phase gate:** Full suite green + `npm run build` (TS strict) before `/gsd-verify-work`.

### Wave 0 Gaps
- None — `src/components/import-review-table.test.tsx` already exists with the full mock harness (`@/actions/import`, `sonner`, `next/navigation`, `@/actions/category-keywords`), the `makeRow` fixture factory, and CLSAI-08 confidence cases (`low-confidence-tag`, `low-confidence-first-sort`, `apply-all`) to mirror/extend. vitest + jsdom infra covers it.

**Observable behaviors to validate (Nyquist minimum surface):**
1. batch applies only rows where `confidence >= 0.6`;
2. rows where `confidence < 0.6` stay pending with `category_id` null (chip still present);
3. exactly `0.6` is treated as confident (applied, no amber tag);
4. button hidden when `confidentSuggestionCount === 0` even if low-confidence rows remain;
5. toast copy + button label match the LOCKED singular/plural pt-BR strings;
6. no DB/network write (`confirmImport` mock never called).

The minimum test surface is the single component test file — no integration/e2e needed (pure client behavior, no server boundary crossed).

## Security Domain

> `security_enforcement` key is **absent** from `.planning/config.json` (treated as enabled by default). However, this phase introduces **no** new attack surface: it is a pure client-side relabel/regate of existing in-memory grid state. No new input parsing, no new network/DB call, no auth/session/crypto change, no new user-supplied data path. The `confidence` value being gated already originates from the (unchanged) AI classification pipeline and is already rendered today.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged — no auth touched. |
| V3 Session Management | no | Unchanged. |
| V4 Access Control | no | No new data access; existing RLS on `confirmImport` path untouched. |
| V5 Input Validation | no (no new input) | The gated `confidence` is internal numeric state already validated upstream (Zod at the AI boundary, Phase 15) — no new boundary. |
| V6 Cryptography | no | None. |

### Known Threat Patterns for {Next.js client component, in-memory grid state}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accidental auto-commit / data leak via bulk action | Tampering / Information disclosure | LOCKED: no DB write in apply path; `confirmImport` (RLS-scoped, `auth.uid() = user_id`) remains the sole persist path — UNCHANGED. Tests assert `confirmImport` is never called. |
| Threshold drift exposing low-confidence guesses as confident | Tampering | Single `LOW_CONFIDENCE` source of truth shared by tag + apply gate; boundary test pins `0.6`. |

## Sources

### Primary (HIGH confidence)
- `src/components/import-review-table.tsx` (read in full this session) — verified `applyAllSuggestions` (`:393-415`), `unappliedSuggestionCount` (`:707-709`), button (`:719-729`), `LOW_CONFIDENCE` (`:109`), `isLowConfidenceAi` (`:193-199`), `ConfidenceTag` (`:177-190`), `ReviewRow.suggestion` (`:261`), toast (`:409-411`).
- `src/components/import-review-table.test.tsx` (read) — vitest + jsdom harness, mocks, `makeRow` factory, CLSAI-08 cases (`apply-all` at `:265-300`, `low-confidence-tag` at `:188`, `low-confidence-first-sort` at `:208`).
- `.planning/phases/23-.../23-CONTEXT.md` (read) — all 3 grey areas accepted → LOCKED decisions.
- `.planning/phases/23-.../23-UI-SPEC.md` (read) — LOCKED pt-BR button + toast copy, byte-identical constraints.
- `.planning/REQUIREMENTS.md` (read) — CLSAI-10 text + traceability (Phase 23, Pending).
- `vitest.config.ts` (read) — `environment: 'jsdom'`, `setupFiles`.
- grep: `unappliedSuggestionCount` referenced only within `import-review-table.tsx`; `nyquist_validation: true` in config; no `security_enforcement` key.

### Secondary (MEDIUM confidence)
- None needed — all claims verified against live first-party source.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all primitives confirmed imported in the target file.
- Architecture: HIGH — single-file edit set verified line-by-line against live source.
- Pitfalls: HIGH — the breaking `apply-all` test, the `>=` boundary, and the TS-strict narrowing are all confirmed from read source.

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable — first-party code, no fast-moving external dependency). Re-verify line numbers if `import-review-table.tsx` is edited by another phase before planning.
