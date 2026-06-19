---
phase: 20
slug: auto-classifica-o-por-palavra-chave-no-upload
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (existing) |
| **Config file** | `vitest.config.ts` (existing — `import.test.ts` + `import-review-table.test.tsx` run today) |
| **Quick run command** | `npx vitest run src/lib/classifier/keywords.test.ts` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Typecheck (TS strict)** | `npx tsc --noEmit` |
| **Estimated runtime** | ~2 s (matcher unit) / full suite |

All Phase 20 tests use the existing in-memory `makeBuilder` mock + pure-function tests — NO live Supabase (env-flaky per project memory). Deterministic.

---

## Sampling Rate

- **After every task commit:** `npx vitest run` on the touched test file (matcher / import / grid)
- **After every plan wave:** `npx vitest run src/lib/classifier src/actions/import.test.ts src/components/import-review-table.test.tsx`
- **Before `/gsd-verify-work`:** full `npm test` green + `npx tsc --noEmit` clean
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|-------------|----------|-----------|-------------------|-------------|--------|
| matcher | 1 | KW-02, KW-04 | `matchKeyword` substring + longest-wins + tie(category sort) + empty guard | unit | `npx vitest run src/lib/classifier/keywords.test.ts` | ❌ W0 | ⬜ pending |
| pipeline | 1 | KW-02, KW-03 | memory miss → keyword sets category_id + source='palavra-chave'; keyword NOT in missNorms; memory prevails; keyword before IA | integration | `npx vitest run src/actions/import.test.ts` (extend) | ✅ extend | ⬜ pending |
| pipeline | 1 | KW-04 | >1 category matches → longest keyword wins end-to-end | integration | `npx vitest run src/actions/import.test.ts -t long` | ✅ extend | ⬜ pending |
| confirm | 1 | KW-05 | nothing persists till confirm; confirm learns merchant→category as today. **Coverage = `confirmImport` left UNCHANGED (category-gated learn loop already learns any classified row, origin-agnostic — research-verified) + the existing confirm suite stays green (20-01 guard).** A dedicated keyword-origin confirm-learn assertion is OPTIONAL (executor may add one mirroring a memória-confirm test if cheap — strengthens KW-05 but not required, since no code path changed). | integration | existing `import.test.ts` confirm suite stays green; `npx tsc --noEmit` | ✅ unchanged-path | ⬜ pending |
| badge | 2 | KW-05 | 'palavra-chave' renders in ProvenanceBadge (lowercase, no icon) + OriginBadge (Title Case + Tags icon); page.tsx derives origin from classification_source | component | `npx vitest run src/components/import-review-table.test.tsx` (extend) | ✅ extend | ⬜ pending |
| types | 1 | KW-02 | union edits compile (ClassificationSource + ReviewRow.origin + OriginVariant) | typecheck | `npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/classifier/keywords.test.ts` — KW-02/KW-04 matcher (substring, longest, tie, empty)
- [ ] Extend `src/actions/import.test.ts` — `keywordRows` fixture + a `category_keywords` branch in `makeBuilder` (mirror the `categories` branch); assert KW-03 ordering + keyword exclusion from the AI batch + longest-wins end-to-end + confirm-learn (KW-05)
- [ ] Extend `src/components/import-review-table.test.tsx` — assert the 'palavra-chave' ProvenanceBadge + OriginBadge variant render
- [ ] Framework install: none — Vitest already configured.

---

## Manual-Only Verifications

*None — Phase 20 is fully automatable (pure matcher + mocked pipeline + component tests). No migration, no PROD push is a phase gate. The keyword feature goes live in PROD once `0036` (Phase 19) is pushed by the owner, but that does not gate Phase 20's local verification.*

---

## Validation Sign-Off

- [ ] All KW-02/03/04/05 behaviors have `<automated>` verify (matcher unit + mocked pipeline + component)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 tests land green

**Approval:** pending
