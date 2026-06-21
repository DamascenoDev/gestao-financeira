# Phase 19 — UI Review

**Status:** resolved — 22/24, 3 warnings all addressed (commit `201ce59`)

> **Resolution (2026-06-19):**
> - **Warning #1 (add-success toast drift) — RATIFIED**: the WR-01 behavior (toast echoes the normalized value, matching the chip) is the better UX; the locked copy in `19-UI-SPEC.md §Copywriting Contract` was updated to `"{keyword}" adicionada.` (keyword = normalized). Contract and code now agree.
> - **Warning #2 (bare `<Field>` without `<FieldGroup>`) — DOCUMENTED EXCEPTION**: the auditor offered "wrap OR document". A `FieldGroup` around a single `Field` adds no grouping value; accepted as a single-field exception, not wrapped.
> - **Warning #3 (hardcoded `id="kw-input"` collision) — FIXED** (`201ce59`): switched to `React.useId()` so per-row dialog instances never share an input id / `htmlFor`.

**Audited:** 2026-06-19
**Baseline:** 19-UI-SPEC.md (approved design contract — base-nova navy+gold, REUSE-only)
**Screenshots:** not captured — the feature is a per-row dialog gated behind an auth'd `/categorias` route + a dropdown-menu interaction; a blind root-URL `playwright screenshot` cannot reach it. Dev server WAS up (ports 3000 & 5173 → 200), but no meaningful unauthenticated/un-interacted capture is possible. Audit is code-level against the contract.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All copy is pt-BR/calm/verbatim EXCEPT the add-success toast, which diverges from the locked contract string (WR-01 fix). |
| 2. Visuals | 4/4 | Chip/affordance grammar is verbatim from `category-filter.tsx`; clear hierarchy; icon-button has `aria-label`. |
| 3. Color | 4/4 | Zero new colors, zero hardcoded hex/rgb; gold accent reserved to the single primary "Adicionar"; X is muted, not destructive. |
| 4. Typography | 4/4 | No ad-hoc sizes/weights — all inherited from vendored primitives; 2-weight + heading rule honored. |
| 5. Spacing | 3/4 | 8-pt scale respected and `mt-6` matches the `categoria-form.tsx` precedent, but the canonical `FieldGroup` wrapper was dropped. |
| 6. Experience Design | 4/4 | Loading (pending+disabled), empty, inline-error, duplicate-no-op, focus mgmt, Enter-to-add all present; no destructive confirm (correct per contract). |

**Overall: 22/24**

---

## Top 3 Priority Fixes

1. **Add-success toast diverges from the locked contract (WARNING)** — `category-keywords-dialog.tsx:105` emits `` `"${normalized}" adicionada.` `` (e.g. `"uber" adicionada.`), but 19-UI-SPEC.md §Copywriting Contract locks this as the fixed string **`"Palavra-chave adicionada."`**. This is the WR-01 fix (commit 3fa1104) and is a *defensible UX improvement* (it echoes the normalized value the user actually stored, matching the chip), but it is an undocumented contract drift — the 19-02-SUMMARY says "Deviations from Plan: None". **Fix:** either (a) update 19-UI-SPEC.md §Copywriting Contract to ratify the echo form as the new contract, or (b) revert to the locked string. Do NOT leave the contract and the code disagreeing silently.

2. **Bare `<Field>` instead of the canonical `<FieldGroup><Field>` skeleton (WARNING)** — `category-keywords-dialog.tsx:151-171` puts a lone `<Field>` directly in the `<form>`, whereas the dialog it claims to mirror (`categoria-form.tsx:189-244`) wraps fields in `<FieldGroup>`. Functionally fine for a single field, but it skips the `@container/field-group` context (so the `Field` `responsive` orientation would never engage) and the established `gap-5` group rhythm. **Fix:** wrap the `Field` in `<FieldGroup>` to match the canonical form skeleton, or document that the bare `Field` is intentional for this one-field form.

3. **Hardcoded element id `id="kw-input"` (WARNING)** — `category-keywords-dialog.tsx:153,156` uses a static `id="kw-input"`. Because each `/categorias` row renders its own `CategoryRowActions` → `CategoryKeywordsDialog`, multiple instances share the same DOM id. Only one dialog is open at a time so the `htmlFor`/`aria-invalid` association still resolves in practice, but a duplicate-id is an a11y/HTML-validity smell. **Fix:** derive a unique id (e.g. `React.useId()` or interpolate `category.id`) for the input + `FieldLabel htmlFor`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- **Verbatim matches (PASS):** dialog title `Palavras-chave — {category.name}` (`:115`), description (`:116-119`), empty heading "Nenhuma palavra-chave" (`:125`), empty body (`:126-129`), label "Nova palavra-chave" (`:153`), placeholder "Ex.: uber" (`:160`), CTA "Adicionar"/"Adicionando…" (`:166`), inline error "Informe uma palavra-chave." (`:81`), chip `aria-label` "Remover palavra-chave {keyword}" (`:139`), remove-success "Palavra-chave removida." (`:73`), duplicate `toast.info` (`:100`). All pt-BR, calm, no exclamation.
- **WARNING — add-success drift (`:105`):** contract = `"Palavra-chave adicionada."`; impl = `` `"${normalized}" adicionada.` ``. WR-01 fix; defensible but un-ratified. See Priority Fix #1.
- **Note (informational):** the duplicate `toast.info` (`:100`) correctly echoes the **normalized** value, consistent with the chip — good a11y/UX call, matches CONTEXT.md normalization-display rule.

### Pillar 2: Visuals (4/4)
- Chip recipe is byte-for-byte the precedent from `category-filter.tsx:106-122` (`Badge variant="secondary" className="gap-1"` + `<button>` + `X size-3`), correctly omitting `CategoryDot` (keywords have no color) per SPEC §Reused components.
- Clear hierarchy: heading (`DialogTitle`, Inter Tight 600) → muted description → chips region → form → footer.
- Icon-only chip-remove button carries a unique descriptive `aria-label` (`:139`); the menu trigger has `aria-label="Ações"` (`category-row-actions.tsx:56`). No bare icon buttons.
- Empty state uses the `Empty`/`EmptyHeader`/`EmptyTitle`/`EmptyDescription` primitive as specified.

### Pillar 3: Color (4/4)
- `grep` for `#hex`/`rgb(` in the dialog → **none**. No hardcoded colors.
- Only two color-bearing classes: `variant="secondary"` (neutral chip pill, `:135`) and `variant="outline"` (Fechar, `:176`). The gold `--primary` accent is reserved to the single default `Button` "Adicionar" (`:165`) — exactly the 10% accent allocation in SPEC §Color.
- Chip-remove `X` inherits muted foreground (no destructive class) — matches contract: removing a keyword is a normal edit, not destructive.
- Color is never the sole signal (text labels + aria-label + literal count).

### Pillar 4: Typography (4/4)
- `grep` for `text-(xs|sm|...)` / `font-(...)` in the dialog → **none**. Every type treatment is inherited from the vendored primitives (DialogTitle, FieldLabel, Badge, Input), so the Phase-7 3-size / 2-weight + 600-heading rule is structurally guaranteed. No new typographic tokens introduced.

### Pillar 5: Spacing (3/4)
- 8-pt scale respected: chips container `flex flex-wrap gap-2` (8px, `:133`), chip internal `gap-1` (4px) + `ml-0.5` remove nudge (`:140`) — all verbatim from the filter-chip precedent. Add row `flex gap-2` (`:154`).
- `DialogContent` supplies `gap-4` between sections; `DialogFooter className="mt-6"` (`:173`) **matches `categoria-form.tsx:245`** exactly — consistent with precedent, not a divergence.
- **WARNING — dropped `FieldGroup` wrapper:** the bare `<Field>` skips the canonical `<FieldGroup>` container used by `categoria-form.tsx` (`gap-5` + `@container`). See Priority Fix #2.
- No arbitrary `[..px]`/`[..rem]` values in the dialog (grep clean).

### Pillar 6: Experience Design (4/4)
- **Loading:** `isPending` disables both "Adicionar" (`:165`, with "Adicionando…" label `:166`) and every chip `X` (`:141`) — the light optimistic-disable from SPEC §Loading state. No spinner overlay (correct — fast actions).
- **Empty:** handled via `keywords.length === 0` → `Empty` primitive (`:122`).
- **Error / duplicate:** `{error}` → `toast.error`; `{duplicate}` → `toast.info` (benign no-op, no red state) — matches contract.
- **Inline validation:** empty-after-trim → `FieldError` "Informe uma palavra-chave." (`:80-82`), `aria-invalid` bound (`:161`).
- **Focus management:** `autoFocus` on input (`:163`); clear + `inputRef.current?.focus()` after successful add (`:106-107`) for keyboard-only flow; Enter-to-add via real `<form onSubmit>` (`:151`). Esc/trap/return-focus left to Base UI defaults per contract.
- **Destructive handling (correct):** chip removal is immediate, no `alert-dialog` confirm — matches CONTEXT.md "persistência imediata por ação". Category deletion (the real destructive action) keeps its confirm via the untouched `CategoryDeleteDialog`.
- **WR-03 fix verified (`:69`):** `handleRemove` clears stale add-validation `error` so a successful remove never leaves the input rendered red — correct shared-state handling between the add field and remove transition.
- **Minor (informational):** the static `id="kw-input"` (`:153,156`) collides across multiple row dialogs (see Priority Fix #3) — practically harmless (one open at a time) but a duplicate-id smell.

---

## Registry Safety

`components.json` present (`shadcn_initialized: true`). UI-SPEC §Registry Safety declares **third-party: none** and `registries: {}`; the dialog composes only already-vendored official primitives (Dialog, Badge, Input, Button, Field, Empty, DropdownMenu) and adds zero new blocks. **Registry audit: 0 third-party blocks checked, no flags.**

---

## Files Audited
- `src/components/category-keywords-dialog.tsx` (the dialog — primary)
- `src/components/category-row-actions.tsx` (menu item + controlled open)
- `src/app/(app)/categorias/page.tsx` (grouped keyword RSC fetch)
- `src/components/category-filter.tsx:106-122` (chip-recipe precedent)
- `src/components/categoria-form.tsx` (canonical dialog/form skeleton precedent)
- `src/components/ui/dialog.tsx`, `src/components/ui/field.tsx` (primitive spacing/orientation defaults)
- 19-UI-SPEC.md, 19-CONTEXT.md, 19-02-PLAN.md, 19-02-SUMMARY.md (baseline + intent)
