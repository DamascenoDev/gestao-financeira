---
phase: 20-auto-classifica-o-por-palavra-chave-no-upload
plan: 02
subsystem: import-review-ui
tags: [keyword-matching, provenance-badge, review-grid, ui]
requires:
  - "20-01 ('palavra-chave' member of ClassificationSource, persisted on parsed rows by PASS 1)"
  - "src/components/origin-badge.tsx (OriginBadge + VARIANT map, memória variant mirrored)"
  - "src/components/import-review-table.tsx (ProvenanceBadge + ReviewRow.origin union)"
provides:
  - "'palavra-chave' member of OriginVariant + neutral VARIANT entry (Tags icon, Title-Case)"
  - "'palavra-chave' member of ReviewRow.origin + neutral ProvenanceBadge branch (lowercase, no icon)"
  - "page.tsx origin derivation from r.classification_source (load-bearing fix)"
affects:
  - "Closes Phase 20 visible UI: keyword-matched rows now render the palavra-chave provenance pill in both review-grid surfaces"
tech-stack:
  added: []
  patterns:
    - "Provenance threaded across the RSC boundary by deriving ReviewRow.origin from the persisted classification_source (not re-derived from category_id alone)"
    - "New origin state reuses the existing neutral pill grammar (memória sibling) with a distinct icon; zero new tokens/components"
key-files:
  created: []
  modified:
    - src/app/(app)/importar/[statementId]/page.tsx
    - src/components/origin-badge.tsx
    - src/components/import-review-table.tsx
    - src/components/import-review-table.test.tsx
decisions:
  - "page.tsx origin: category_id===null → 'não classificada'; else classification_source==='palavra-chave' → 'palavra-chave'; else 'memória' (parse-time rows only carry memória/palavra-chave; manual/IA do not apply — A2 verified)"
  - "OriginBadge keyword variant uses Tags (Brain reserved for memória) so the two neutral states differ beyond the label (a11y)"
  - "ProvenanceBadge keyword branch mirrors memória exactly (bg-secondary, lowercase, no icon) — never the gold bg-primary IA treatment"
  - "classifyRow / confirmImport left untouched: overwriting a keyword pick already flips origin→'manual', dropping the pill (KW-05, identical to overwriting memória)"
metrics:
  duration_min: 5
  completed: 2026-06-19
  tasks: 2
  files_created: 0
  files_modified: 4
status: complete
---

# Phase 20 Plan 02: Keyword Provenance Badge (UI surface) Summary

Made the **palavra-chave** badge actually render in the import review grid (KW-02/KW-05). The load-bearing fix is in `page.tsx`: the review-grid RSC was re-deriving `origin` from `category_id` alone, silently discarding the `classification_source='palavra-chave'` that Plan 20-01 persists. It now reads `classification_source`, so a keyword-matched row surfaces the neutral `palavra-chave` pill in both review-grid surfaces (Categoria cell + Origem column) instead of being mislabeled `memória`.

## What Was Built

**Task 1 — origin derivation + the two UI unions (commit 12f59e5)**
- `page.tsx` (~line 204): origin now derives from `r.classification_source` — `category_id===null` → `'não classificada'`, else `classification_source==='palavra-chave'` → `'palavra-chave'`, else `'memória'`. The source is no longer discarded (the fix without which the badge never renders — 20-RESEARCH Pitfall 1).
- `import-review-table.tsx`: `ReviewRow.origin` union gains `'palavra-chave'`. OriginBadge call sites (desktop + mobile) pass `r.origin` through unchanged — the new variant flows once the VARIANT map has it.
- `origin-badge.tsx`: `OriginVariant` union gains `'palavra-chave'`; imported `Tags` from `lucide-react`; added the VARIANT entry mirroring `memória` — neutral `bg-muted text-muted-foreground`, Title-Case label `'Palavra-chave'`, distinct `Tags` icon (Brain stays reserved for memória).

**Task 2 — ProvenanceBadge branch + component tests (TDD, commit 92a1b07)**
- RED: added 3 component tests; `keyword-provenance-badge` failed (no lowercase pill); the OriginBadge + mutual-exclusivity tests passed on Task 1's wiring alone.
- GREEN: `ProvenanceBadge` (~line 131) gains a `row.origin === 'palavra-chave'` branch mirroring memória exactly — `<AffordancePill className="bg-secondary text-secondary-foreground">palavra-chave</AffordancePill>` (lowercase, no icon, never gold). Updated the badge doc comment.
- Tests: `keyword-provenance-badge` (lowercase `palavra-chave`, no chip/IA badge), `keyword-origin-badge` (Title-Case `Palavra-chave`), `keyword-distinct-from-memoria` (mutual exclusivity in both casings). Anchored regex matchers keep the two surfaces distinct.
- `classifyRow` and `confirmImport` untouched (KW-05): overwriting via the Select already flips origin→'manual', dropping the pill — identical to overwriting memória.

## Verification

- `npx vitest run src/components/import-review-table.test.tsx` → 11 passed (8 existing + 3 new) — both badge surfaces (KW-02/KW-05).
- `npx tsc --noEmit` → clean (unions match the call sites; no `any`).
- `npx vitest run` (full phase gate) → 857 passed across 99 files; no regression.

## Deviations from Plan

None — plan executed exactly as written. Assumption A2 (a classified parsed row only carries `memória` or `palavra-chave` at parse-time) held; the `else → 'memória'` fallback is correct.

## Threat Surface

No new surface beyond the threat model. The origin derivation is a pure read of an already-RLS-scoped field on the parsed row (T-20-04 accept). The pill is a non-interactive `<span>` mirror of memória — no new interactive element, no new write path; overwrite runs the existing `classifyRow` (T-20-05 accept). No new packages — `Tags` is a named export of the already-vendored `lucide-react` (T-20-SC n/a).

## Self-Check: PASSED

- FOUND: src/app/(app)/importar/[statementId]/page.tsx (modified)
- FOUND: src/components/origin-badge.tsx (modified)
- FOUND: src/components/import-review-table.tsx (modified)
- FOUND: src/components/import-review-table.test.tsx (modified)
- FOUND commit: 12f59e5 (Task 1)
- FOUND commit: 92a1b07 (Task 2)
