---
phase: 4
slug: upload-classifica-o-inteligente
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-16
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit + RLS integration against local Supabase) — installed |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` |
| **Full suite command** | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** quick run
- **After every plan wave:** full suite + tsc
- **Before verify:** full suite green
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Secure/Correct Behavior | Test Type | Automated Command | Status |
|---------|------|-------------|-------------------------|-----------|-------------------|--------|
| 4-W0-01 | 0 | IMP-03 | in-house OFX parser: STMTTRN FITID/DTPOSTED/TRNAMT/NAME→{occurred_on, amount_cents, descriptor}; latin1 + dot-decimal (NOT parseBRLToCents) | unit | `npx vitest run src/lib/parsers/ofx.test.ts` | ✅ |
| 4-W0-02 | 0 | IMP-02/03 | CSV (papaparse) + column mapping → normalized rows; comma decimal via money.ts; DD/MM dates | unit | `npx vitest run src/lib/parsers/csv.test.ts` | ✅ |
| 4-W0-03 | 0 | IMP-04 | dedup idempotent: re-upload same file = "0 novas" (content_hash); cross-statement dupes skipped (dedupe_key) | integration | `npx vitest run tests/import-dedup.test.ts` | ✅ substrate / ❌-pending actions |
| 4-W0-04 | 0 | CLS-01/03/04 | normalizeDescriptor deterministic; exact memory match; miss returns unclassified | unit | `npx vitest run src/lib/normalize.test.ts` | ✅ |
| 4-W0-05 | 0 | CLS-03/04 | learn-on-confirm: confirming a row upserts merchant_patterns; next import of same descriptor auto-classifies | integration | `npx vitest run tests/import-learn-on-confirm.test.ts` | ✅ substrate / ❌-pending actions |
| 4-W0-06 | 0 | RSV-06 | confirming a Reserva-category import row saves merchant→reserva + creates the aporte ledger 'in' | integration | `npx vitest run tests/import-reserva-aporte.test.ts` | ✅ substrate / ❌-pending actions |
| 4-W0-07 | 0 | CLS-05 | point-in-time: renaming a category does NOT rewrite imported transactions' recorded category | integration | `npx vitest run tests/import-point-in-time.test.ts` | ✅ substrate / ❌-pending actions |
| 4-W0-08 | 0 | CLS-06 | recurring heuristic: same descriptor_norm across ≥N months flags recurring | integration | `npx vitest run tests/import-recurring.test.ts` | ✅ substrate / ❌-pending actions |
| 4-W0-09 | 0 | SEC-03 | suggestCategory seam returns null in v1 (no external call); an injection-style descriptor still yields safe handling + enum-valid output path | unit | `npx vitest run src/lib/classifier/suggest.test.ts` | ✅ |
| 4-W0-10 | 0 | IMP-01/05 | IDOR: forged statement_id / reserva_id / category_id rejected server-side before persist | integration | `npx vitest run tests/import-idor.test.ts tests/import-storage-rls.test.ts` | ✅ substrate / ❌-pending actions |

> Filenames follow the PLAN (04-01-PLAN.md `files_modified`), which supersedes the literal names listed in the Wave 0 Requirements section below. Unit suites (OFX/CSV/normalize/dedupe/suggest) are fully GREEN now; integration suites assert the live-schema substrate GREEN and mark the not-yet-built ingestStatement/confirmImport behavior with `it.todo` naming Plan 02-03.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/parse-ofx.test.ts` — in-house OFX parser vs synthetic OFX fixture
- [ ] `tests/parse-csv.test.ts` — papaparse + mapping vs synthetic CSV fixture
- [ ] `tests/dedup.test.ts` — "0 novas" re-upload + cross-statement dedupe_key
- [ ] `tests/normalize-descriptor.test.ts` — determinism + match/miss
- [ ] `tests/learn-on-confirm.test.ts` — pattern upsert + auto-classify next
- [ ] `tests/import-aporte.test.ts` — merchant→reserva + aporte
- [ ] `tests/point-in-time.test.ts` — category rename leaves history intact
- [ ] `tests/recurring.test.ts` — recurring heuristic
- [ ] `tests/suggestion-seam.test.ts` — null seam + injection safety
- [ ] `tests/import-idor.test.ts` — IDOR rejection
- [ ] synthetic fixtures: `tests/fixtures/*.ofx`, `tests/fixtures/*.csv` (BR, pt-BR, comma decimals, DD/MM, a byte-identical re-upload pair, an injection descriptor)
- [ ] Reuse `tests/helpers/local-supabase.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upload dropzone → progress → review lands | IMP-01 | Browser file upload | Drop an OFX/CSV; confirm progress + review screen |
| CSV column-mapping dialog on ambiguous header | IMP-02 | UI interaction | Upload a non-standard CSV; map columns; confirm preview |
| Review: classify a memory-miss row + bulk-classify; Confirmar persists + learns | IMP-05/CLS-03 | UI interaction | Classify amber rows, confirm, re-upload → those merchants now auto-classified |

*All parsing/dedup/memory/learning/IDOR logic is automated; manual items are browser-interaction confirmations.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
