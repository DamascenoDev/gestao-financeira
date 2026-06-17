---
phase: 8
slug: substrato-carro-crud-navega-o
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 8 — Validation Strategy

> Per-phase validation contract. Substrate + CRUD phase: existing vitest suite (~599) is the regression gate; new unit tests cover carro actions/schema/components; RLS isolation of `carros`/`abastecimentos`/`transactions.carro_id` is the security-critical check (2-user style, mirrors SEC-01); `next build` + `tsc` + `supabase gen types` (no drift) are the substrate gates. Planner fills the per-task map below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react 16 + jsdom |
| **Config file** | repo vitest config (`npm test` → `vitest run`) |
| **Quick run command** | `npm test -- <file>` |
| **Full suite command** | `npm test` (baseline ~599 green) |
| **Estimated runtime** | ~30-60s full; <10s single file |

Build gate: `npm run build`. Type gate: `npx tsc --noEmit`. Types regen: `supabase gen types typescript` → no drift in `database.types.ts`. RLS: 2-user isolation test for `carros`/`abastecimentos`/`transactions.carro_id` (mirror existing isolation tests).

---

## Sampling Rate

- **After every task commit:** `npm test -- <touched>` + `npx tsc --noEmit`.
- **After every plan wave:** `npm test` (full ≥599 green) + `npm run build`.
- **Before verify:** full suite green + build clean + types no-drift + RLS isolation green.
- **Max feedback latency:** ~60s.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| {planner fills} | | | CAR-01/06 | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] {planner: carro action/schema test stubs, RLS isolation test for new tables}

*If existing infra covers a change, note it.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {planner fills any visual/manual checks; most of this phase is automatable} | | | |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] RLS isolation test covers the 3 new schema objects
- [ ] Types regenerate with no drift
- [ ] `nyquist_compliant: true` set when planner completes the map

**Approval:** pending
