---
phase: 1
slug: funda-o-auth-rls-dinheiro-schema
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) — installed in Wave 0 |
| **Config file** | none — Wave 0 installs `vitest.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-W0-01 | 01 | 0 | SEC-02 | T-1-secrets | Money math exact (centavos), no float | unit | `npx vitest run money` | ❌ W0 | ⬜ pending |
| 1-W0-02 | 01 | 0 | AUTH-03 | T-1-rls | User A cannot read User B rows (RLS) | unit/integration | `npx vitest run rls-isolation` | ❌ W0 | ⬜ pending |
| 1-W0-03 | 01 | 0 | CAT-01 | — | New user gets 11 seeded categories | unit/integration | `npx vitest run seed-categories` | ❌ W0 | ⬜ pending |
| 1-W0-04 | 01 | 0 | SEC-02 | T-1-secrets | Service-role key absent from client bundle | unit/script | `npx vitest run bundle-secret-grep` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` + `vitest` install — no framework yet (greenfield)
- [ ] `src/lib/money.test.ts` — centavos parse/format/sum exactness (SEC-02 money exactness)
- [ ] `tests/rls-isolation.test.ts` — two-user RLS isolation against local Supabase (AUTH-03)
- [ ] `tests/seed-categories.test.ts` — signup trigger seeds 11 BR categories (CAT-01)
- [ ] `tests/bundle-secret-grep.test.ts` — grep built client bundle for secret key leakage (SEC-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login → session persists across refresh | AUTH-02 | Browser session/cookie behavior needs a real browser | Login, refresh page, confirm still authenticated |
| Logout from any page | AUTH-04 | UI interaction | Click logout, confirm redirect to login + protected routes blocked |
| Supabase credentials wired (`.env.local`) | AUTH-01 | Needs user's personal Supabase URL + keys | User pastes URL + publishable/secret keys |
| Vercel link + env + dev deploy of skeleton | — | Needs Vercel auth/link | `vercel link` + env push + deploy |

*Two-user RLS isolation IS automated (runs against `supabase start` local DB); the manual items above are browser/credential-bound only.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
