---
phase: 14
slug: key-storage-byok-settings
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run src/lib/schemas/ai-settings.test.ts src/lib/ai` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~30–60 seconds (full suite ~761 tests) |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched module
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green + `tsc --noEmit` + `npm run build`
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Filled/refined by the planner + during execution. Seed rows from the Validation Architecture in 14-RESEARCH.md.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-xx-xx | xx | 1 | BYOK-04 | key-leak | `validateAiSettings` rejects non-enum provider; schema projects only `has_key`+`provider` | unit | `npx vitest run src/lib/schemas/ai-settings.test.ts` | ❌ W0 | ⬜ pending |
| 14-xx-xx | xx | 1 | BYOK-03 | bad-key | provider error (401/429/network) → friendly pt-BR message, never throws | unit | `npx vitest run src/lib/ai` | ❌ W0 | ⬜ pending |
| 14-xx-xx | xx | 1 | BYOK-02/04 | plaintext-at-rest | `ai_settings` row stores only `key_secret_id`; key never selectable by client | manual+unit | RLS/isolation test + Network/bundle grep | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/schemas/ai-settings.test.ts` — schema + provider-enum stubs for BYOK-01/04
- [ ] `src/lib/ai/*.test.ts` — provider-factory + error-mapping stubs for BYOK-03
- [ ] vitest already installed — no framework install needed

*Sampled edges (from 14-RESEARCH Validation Architecture): no-key first run · valid-key save · invalid-key test · provider error (429/network) · cross-user isolation of `ai_settings` · key-never-on-client.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chave nunca aparece no client | BYOK-04 | Requer inspeção de Network tab / RSC payload / bundle ao vivo | Abrir /conta/configuracoes-ia, salvar uma chave fake, inspecionar Network + view-source + grep do bundle por `sk-`/`AIza` → ausente; RSC só projeta `has_key`+`provider` |
| Vault decrypt via RPC SECURITY DEFINER | BYOK-04 | Depende do `supabase db push` (LOCAL+PROD) — fora do stack de teste unitário | Após push: chamar `get_ai_api_key()` como usuário A não retorna secret do usuário B (auth.uid filter) |
| `supabase db push` aplicado | BYOK-02/04 | Migration 0033 só tem efeito após push manual (dev aponta p/ PROD) | Rodar push LOCAL + PROD, depois `npm run gen:types`; tabela + RPCs existem |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
