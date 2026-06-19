---
phase: 18
slug: ai-classifica-compras-corretamente
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` (+ `vitest.setup.ts`) |
| **Quick run command** | `npx vitest run src/lib/ai/classify.test.ts` |
| **Full suite command** | `npm test` (→ `vitest run`) |
| **Typecheck (TS strict gate)** | `npx tsc --noEmit` |
| **Estimated runtime** | ~10 s (single file) / ~full suite + tsc |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/ai/classify.test.ts && npx tsc --noEmit`
- **After every plan wave:** Run `npm test` (catches the fixture ripple in `suggest.test.ts`, `import.test.ts`, `tests/pii-guard.test.ts`)
- **Before `/gsd-verify-work`:** Full suite green + `tsc --noEmit` clean
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-xx | 01 | 1 | CLSAI-09 | T-prompt-injection | Prompt carries each category `(consumo)`/`(alocação)` tag + hard rule | unit | `npx vitest run src/lib/ai/classify.test.ts -t "kind"` | ✅ extend | ⬜ pending |
| 18-01-xx | 01 | 1 | CLSAI-09 | T-trust-model | Returned `alocacao` id is nulled by gate; confidence kept | unit | `npx vitest run src/lib/ai/classify.test.ts -t "kind gate"` | ✅ extend | ⬜ pending |
| 18-01-xx | 01 | 1 | CLSAI-09 | — | `consumo` id passes straight through (no regression) | unit | existing CLSAI-04 happy-path | ✅ existing | ⬜ pending |
| 18-01-xx | 01 | 1 | CLSAI-09 | SEC-03 | PII egress unchanged — descriptor_norm + `id: nome (kind)` only | unit | `npx vitest run src/lib/ai/classify.test.ts -t "SEC-03"` | ✅ existing | ⬜ pending |
| 18-01-xx | 01 | 1 | CLSAI-09 (compile) | — | All call sites + 4 fixtures typecheck with widened `{id,name,kind}` | typecheck | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 18-0x-xx | 0x | — | MKT-01 | — | Migration `0035` in PROD; "Marketplace" visible in account | manual | `supabase migration list` → user `supabase db push` → re-signup | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] None — existing infrastructure (`vitest.config.ts`, mocked `provider-factory`) covers all CLSAI-09 assertions. Only fixture edits + 2 new `describe` blocks; no new framework/config/fixture file.

*Existing infrastructure covers all automatable phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Marketplace" category present in PROD account; AI suggestion lands on a consumo bucket for a never-seen marketplace descriptor | MKT-01 | PROD data + account wiped 2026-06-19; not automatable. `supabase db push` is a PROD mutation = owner action. | 1. Claude: `supabase migration list` → confirm `0035` Remote. 2. If absent, user runs `supabase db push`. 3. Re-signup in PROD → confirm "Marketplace" appears in `/categorias`. 4. Upload an OFX with an AliExpress/Mercado Livre descriptor → AI suggestion is a consumo category (never Investimentos/Reserva). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (none)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
