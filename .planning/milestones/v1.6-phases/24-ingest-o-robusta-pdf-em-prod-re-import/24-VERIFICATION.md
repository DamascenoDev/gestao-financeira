---
phase: 24-ingest-o-robusta-pdf-em-prod-re-import
verified: 2026-06-21T12:30:00Z
status: human_needed
score: 7/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Run `supabase db push` against the LIVE PROD project (with SUPABASE_ACCESS_TOKEN / `supabase login`), then `npm run gen:types` and confirm `git diff --quiet src/types/database.types.ts` exits 0."
    expected: "Output lists 0037 then 0038 applied in order; types diff empty. An `update public.statements set status='imported'` on PROD then succeeds instead of raising SQLSTATE 23514."
    why_human: "Credential gate — needs interactive PROD auth not present in this environment. Encoded as Task 4 (autonomous:false). Code-side work is complete and locally replay-proven; this is a deploy action, not an implementation gap."
  - test: "After the PROD deploy, upload a real credit-card statement PDF in PROD (SC1) and confirm it parses to the review grid."
    expected: "The pdfjs worker resolves in the Vercel serverless bundle — no `Cannot find module '.../pdf.worker.mjs'` error; rows render for review."
    why_human: "SC1 'works in PROD' requires a real Vercel deploy + live upload — runtime/visual behavior grep cannot observe. Deferred human-verify UAT, like Phase 22."
---

# Phase 24: Ingestão robusta (PDF em PROD + re-import) Verification Report

**Phase Goal:** A ingestão de faturas para de quebrar em produção e de bloquear re-uploads legítimos: o worker do `pdfjs` passa a existir no bundle serverless da Vercel (upload de PDF funciona em PROD), o parser degrada de forma clara em entradas ruins (sem OCR), e o mesmo arquivo pode ser re-importado quando a importação anterior nunca foi confirmada.
**Verified:** 2026-06-21T12:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Migration 0038 widens statements.status CHECK to include 'imported' (re-runnable, non-destructive superset) | ✓ VERIFIED | `0038_statements_status_imported.sql:37` drop-if-exists + `:42-44` named add `check (status in ('uploaded','parsing','parsed','failed','imported'))` — 5-value strict superset of the 0019 4-value set. Mirrors 0032 exactly. |
| 2 | After 0038 applies, UPDATE status='imported' succeeds where it raised 23514 before | ✓ VERIFIED | Migration shape is correct (truth 1). Executor applied to LOCAL stack and proved `UPDATE 1` in a rolled-back tx (SUMMARY:62-63); the corresponding `confirmImport` update exists at `import.ts:995-998`. PROD activation = human item below. |
| 3 | Re-upload of a CONFIRMED statement returns alreadyImported (0 novas) | ✓ VERIFIED | Fast-path present at `import.ts:323-330` (`if existing.status === 'imported' → alreadyImported: true`). Test `import.test.ts:410` passes. |
| 4 | Re-upload of an UNCONFIRMED statement re-parses and reuses the existing id | ✓ VERIFIED | `import.ts:331-333` reuses `existing.id` + re-parses. Test `import.test.ts:422` (`alreadyImported === false`) passes. |
| 5 | Image-only PDF hard-blocks with a CSV/OFX-steering message | ✓ VERIFIED | `import.ts:357-363` empty-extract hard block returning the CSV/OFX steer message. Test `import.test.ts:508` passes. |
| 6 | Generic non-Santander noise degrades to empty result without throwing AND with honest counts | ✓ VERIFIED | `pdf.test.ts:122-129` strengthened: `.not.toThrow()` + `toEqual({ rows: [], dropped: expect.any(Number), capped: false })`. Test passes. |
| 7 | next.config.ts force-includes the pdfjs worker in the serverless trace | ✓ VERIFIED | `next.config.ts:27-30` `outputFileTracingIncludes` maps `/importar` + `/importar/[statementId]` → `PDFJS_RUNTIME_ASSETS` incl. `pdf.worker.mjs`; `:23` `serverExternalPackages: ["pdf-parse"]`. The worker file actually exists at `node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs` (real path, not phantom). |
| 8 | database.types.ts diff is empty (text+CHECK widening leaves the type `string`) | ✓ VERIFIED | `git diff --quiet src/types/database.types.ts` exits 0. |

**Score:** 7/8 truths verified (truth 2's PROD activation deferred to human; its migration shape + local replay are verified, so it counts as VERIFIED here — the human item is the live PROD push, surfaced below)

> Note on score: all 8 must-have truths are code-side VERIFIED. Status is `human_needed` (not `passed`) solely because Step 8 produced two genuine deploy/UAT items (PROD `supabase db push` and the SC1 live upload), which are `autonomous:false` by design — not phase gaps.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/0038_statements_status_imported.sql` | Widened statements.status CHECK incl. 'imported' | ✓ VERIFIED | Exists; contains `statements_status_check`; drop-if-exists + named add; superset; negative-greps clean (no alter policy / disable RLS / create type / as enum). |
| `src/lib/parsers/pdf.test.ts` | Strengthened generic PDF degradation assertion | ✓ VERIFIED | `:122-129` contains `not.toThrow` + `capped: false` full-shape assert. Suite green. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `0038...sql` | `src/actions/import.ts` | widened CHECK lets `confirmImport.update({status:'imported'})` (import.ts:995-998) succeed → fast-path (import.ts:323-330) reachable | ✓ WIRED | Both ends present in actual code. The update target value `'imported'` is now in the migration's CHECK set. Activation in PROD pending the deferred push (human item). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| PDF + import contract tests | `npx vitest run src/lib/parsers/pdf.test.ts src/actions/import.test.ts` | 72 passed (2 files) | ✓ PASS |
| Migration positive greps | grep drop/add/superset | DROP_OK, SUPERSET_OK | ✓ PASS |
| Migration negative greps | grep alter policy / disable RLS / enum | NEGATIVE_GREP_CLEAN | ✓ PASS |
| Generated types unchanged | `git diff --quiet src/types/database.types.ts` | exit 0 | ✓ PASS |
| next.config worker include | grep outputFileTracingIncludes / pdf.worker.mjs / serverExternalPackages pdf-parse | all present | ✓ PASS |
| Worker asset exists | `test -f node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs` | exists | ✓ PASS |
| Migration ordering | `ls supabase/migrations` | 0038 latest, after 0037 | ✓ PASS |

### Probe Execution

No project probes declared or conventional `scripts/*/tests/probe-*.sh` present for this phase. Phase-gate proof is the vitest suite (above) + the executor's local migration replay (`supabase migration up --local` → `UPDATE 1`, rolled back). Not re-run here: the local Supabase stack and PROD push are environment/credential-gated (dev env points at PROD per project notes), so re-running would risk live mutation — left to the deferred human push.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PDF-06 | 24-01 | Upload de fatura PDF funciona em PROD (worker no bundle serverless) | ✓ SATISFIED (code) / ? NEEDS HUMAN (PROD) | next.config worker include verified at source (truth 7); SC1 live-PROD is the deferred UAT item. |
| PDF-07 | 24-01 | Parser degrada com clareza em entradas ruins, sem OCR | ✓ SATISFIED | Image-only hard block (truth 5) + generic honest-counts degradation (truth 6), both tested green. |
| IMP-07 | 24-01 | Re-upload permitido quando importação anterior não foi confirmada | ✓ SATISFIED (code) | Fast-path + re-parse (truths 3,4) + migration unlocking the status update (truths 1,2). PROD push deferred. |

All 3 declared requirement IDs accounted for; REQUIREMENTS.md maps exactly PDF-06/PDF-07/IMP-07 to Phase 24 — **no orphaned requirements**.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX in modified files; no stubs; logged-and-swallowed status error is intentional (WR-02, cosmetic — documented at import.ts:992-994) | ℹ️ Info | None blocking |

### Human Verification Required

1. **PROD `supabase db push` of 0037 + 0038** — run with PROD credentials; confirm 0037 then 0038 applied in order, `npm run gen:types` leaves an empty diff, and `update statements set status='imported'` succeeds in PROD. (Task 4, autonomous:false — credential gate, not an implementation gap.)
2. **SC1 live PDF upload in PROD after deploy** — upload a real statement PDF in PROD post-deploy; confirm the pdfjs worker resolves (no missing-module error) and rows reach the review grid. (Deferred UAT, like Phase 22.)

### Gaps Summary

No code-side gaps. All eight must-have truths are verified against the actual tree: the 0038 migration is a correctly-shaped, re-runnable, non-destructive superset CHECK that touches only the constraint (RLS preserved); the re-import fast-path, unconfirmed re-parse, image-only hard block, and generic honest-counts degradation are all present in code and covered by green tests; next.config force-includes a pdfjs worker asset that actually exists on disk; and the generated types are byte-identical. The full vitest suites for the two affected modules pass (72/72).

The only outstanding items are the two `autonomous:false` deploy/UAT actions (PROD migration push + live PDF upload), which the plan deliberately encoded as human gates and which do not block code-side phase closure. Status is therefore `human_needed`, not `gaps_found`.

---

_Verified: 2026-06-21T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
