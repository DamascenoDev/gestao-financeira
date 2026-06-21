# SECURITY.md — Phase 18: AI classifica compras corretamente

**Audit date:** 2026-06-19
**ASVS Level:** 1
**block_on:** high
**Verdict:** SECURED — 6/6 threats closed (register authored at plan time; each mitigation verified in implemented code)

This phase has TWO plans:
- **18-01 (CLSAI-09)** — kind-aware AI classification + anti-allocation code gate (code, `autonomous: true`, complete).
- **18-02 (MKT-01)** — apply data+trigger migration `0035` to PROD (`autonomous: false`, blocking-human checkpoint, deferred 2026-06-19; no PROD access token in env). The audit verifies the **process** mitigation for T-18-04 (no autonomous `db push` task in the plan/summary), not live PROD state.

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-18-01 | Tampering (LLM categoryId) | mitigate | CLOSED | Both gates present in `src/lib/ai/classify.ts`: enum gate `validateSuggestion(r.categoryId, categories)` at line 135 + NEW kind gate `const categoryId = kind === 'consumo' ? gatedId : null` at line 141 (kind resolved via `categories.find((c) => c.id === gatedId)?.kind` line 140). A prompt-injected allocation id is nulled by BOTH gates. Proven by `classify.test.ts` "kind gate (CLSAI-09)" + "enum gate (CLSAI-04)" describes (15/15 pass). |
| T-18-02 | Information Disclosure (prompt egress / SEC-03 / LGPD) | accept | CLOSED | `buildUserText` (`classify.ts` lines 88–97) emits ONLY `id: name (kind)` category lines + normalized descriptor lines — no amount/date/raw descriptor. Accepted-risk basis: the `(kind)` tag is category metadata, not PII. Verified green: `classify.test.ts` SEC-03 describe (lines 146–162) negative-greps `R$`, `dd/mm/yyyy`, `yyyy-mm-dd`, `amount_cents\|occurred_on\|descriptor_raw`; `tests/pii-guard.test.ts` line 61 negative-greps `R$\|date\|amount\|occurred_on\|descriptor_raw`. Both pass; no new PII token introduced. Accepted-risk entry logged below. |
| T-18-03 | Tampering (trusting model choice) | mitigate | CLOSED | Belt-and-suspenders confirmed. Soft layer: `SYSTEM_PROMPT` hard rule at `classify.ts` line 79 (`Todo descritor é um GASTO. NUNCA atribua uma categoria de alocação a um gasto; … retorne categoryId: null`). Hard layer: the code kind gate (line 141) — the model is never the final authority. System-prompt tokens asserted by `classify.test.ts` "kind-aware prompt (CLSAI-09)" describe (`NUNCA atribua`, `categoryId: null`). |
| T-18-04 | Elevation of Privilege / Tampering (apply migration 0035 to PROD) | mitigate | CLOSED (process) | Plan `18-02-PLAN.md` is `autonomous: false` with a `checkpoint:human-verify gate="blocking-human"` task; prohibition "Claude NUNCA roda `supabase db push` contra PROD autonomamente" present. Task 1 is read-only `supabase migration list` only. `18-02-SUMMARY.md` confirms Claude ran only the read-only check (which itself failed for lack of a valid access token) and never ran `db push`. No autonomous push task exists in plan or summary. |
| T-18-05 | Information Disclosure (PROD account data) | accept | CLOSED | `0035` is data + trigger; no new RLS policy. `categories` reads run under the RLS-scoped user session: `src/actions/import.ts` calls `supabase.auth.getClaims()` (line 251) then `.from('categories').select('id, name, kind')` (lines 423–424) on the same RLS-active server client — ASVS V4 L1 access control unchanged. Accepted-risk entry logged below. |
| T-18-SC | Tampering (supply chain / installs) | mitigate (N/A) | CLOSED | Zero packages installed this phase. `git log` over all phase-18 commits shows NO `package.json` / lockfile change (last install was commit `9868816`, phase 14). `tests/pii-guard.test.ts` lines 42–52 additionally pin the AI dep set to exactly `['@ai-sdk/anthropic', '@ai-sdk/google']` (catches an accidental umbrella/non-approved provider re-add) and passes. |

---

## Accepted Risks Log

| Threat ID | Risk | Rationale | ASVS |
|-----------|------|-----------|------|
| T-18-02 | The `(kind)` tag (`consumo`/`alocação`) plus the normalized descriptor egress to the BYOK LLM provider (Gemini/Claude). | The kind tag is category metadata, not PII. The egress payload carries no amount, date, or raw descriptor — enforced and regression-guarded by the SEC-03 / pii-guard negative-grep tests (both green). No new PII token vs. the v1.4 baseline. | V5 (Input Validation — egress payload constrained) |
| T-18-05 | Migration `0035` adds default data + a re-seed/backfill trigger to PROD `categories`; existing account data is read during classification. | `categories` remains RLS-scoped by `user_id` (no new policy); the select runs under the caller's authenticated session (`getClaims()` → RLS-active client). Unchanged ASVS V4 L1 isolation. PROD application is owner-gated (T-18-04). | V4 (Access Control via RLS) |

---

## Hardening Beyond Plan (informational)

- **T-18-01 / T-18-05 fail-safe strengthened:** `import.ts` narrows the DB `kind` (typed `string`) via an `isCategoryKind` enum guard (`CATEGORY_KINDS.includes(k)`, lines 429–434) that defaults an unexpected value to `'alocacao'` — fail-closed, so a future widened DB CHECK constraint cannot smuggle a non-canonical kind past the gate. This replaces the blind `as CategoryKind` cast in the original plan diff (the WR-01 code-review fix, commit `436fe4f`). Strictly stronger than the documented mitigation.

---

## Unregistered Flags

None. Neither `18-01-SUMMARY.md` nor `18-02-SUMMARY.md` contains a `## Threat Flags` section, and no new attack surface (export, auth path, data flow) appeared during implementation beyond the registered threats. The phase added no new public symbols, no new schema, and no new dependency.

---

## Verification Commands Run

- `git log` over phase-18 commits touching `package.json`/lockfiles → none (T-18-SC).
- `grep` for `validateSuggestion`, `kind === 'consumo'`, `categories.find`, `NUNCA atribua`, `buildUserText`, `getClaims`, `select('id, name, kind')`, `CATEGORY_KINDS` in the cited files → all present at the cited lines.
- `npx vitest run src/lib/ai/classify.test.ts tests/pii-guard.test.ts` → **2 files / 15 tests passed** (SEC-03 egress guard, CLSAI-04 enum gate, CLSAI-09 kind gate, dep-set pin).

**Note:** Implementation files were NOT modified by this audit. Only this `SECURITY.md` was written.
