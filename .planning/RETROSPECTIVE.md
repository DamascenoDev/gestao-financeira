# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.2 — Carro

**Shipped:** 2026-06-18 (code-complete, local stack)
**Phases:** 4 (8–11) | **Plans:** 13 | **Tasks:** 17

### What Was Built
- Carro data substrate — `carros`/`abastecimentos` tables, the non-accounting `transactions.carro_id` tag, two `security_invoker` consumption views (km/l + R$/km), cost XOR CHECK + partial unique index, uniform RLS (Phase 8).
- IDOR-safe Carro CRUD + nav — `carroSchema` + `assertOwnedCarro` + four `{ ok } | { error }` server actions, `/carros` list + `/carros/[id]`, sidebar + mobile bottom-nav "Carros" tab (Phase 8).
- Non-destructive expense→car tagging (D4) — form selector + extrato row/bulk action + import-review, never altering category/value/goal math (Phase 9).
- Hybrid fueling log + consumption — XOR cost (linked invoice txn OR manual), km/l full-tank method + R$/km via views (Phase 10).
- Car detail capstone — `/carros/[id]` with 3 KPI cards, gasto-por-categoria bars, km/l-over-time recharts chart, fueling history; per-card KPIs on the list (Phase 11).

### What Worked
- **Clone-the-proven-grammar.** Every Carro surface was cloned verbatim from the already-shipped reservas/MEI patterns (CarroForm←reserva-form, CarroPicker←ReservaPicker, CarroCard←reserva card, actions←reservas actions). Near-zero new design decisions, zero new npm deps across the whole milestone.
- **Front-loaded irreversible schema (Phase 8 BLOCKING).** All tables/views/`carro_id`/RLS landed in one substrate phase before any slice depended on them — no mid-milestone migration churn.
- **Wave-0 TDD on the invariants.** D4 non-destructiveness and IDOR re-derive were pinned by failing integration tests before the UI existed; the byte-identical tag+untag assertion caught the property that matters.
- **Shared ownership module.** Extracting `assertOwnedCarro`/`syncReservaLedger` into `src/lib/ownership.ts` kept one ledger/IDOR path across transactions + import + abastecimentos — no cross-sibling drift.

### What Was Inefficient
- **Test-glob foot-gun repeated.** The vitest `include` matches `tests/**/*.test.ts` (`.ts` only) + `src/**/*.test.{ts,tsx}`; planners kept specifying `.tsx` tests under `tests/`, which would never be collected. Hit in 11-01 AND 11-02 (same Rule-3 fix both times). Convention should have been captured after the first.
- **`kmPerLitroLabel` contract drift.** Multiple plans asserted `kmPerLitroLabel(12.4) === '12,4 km/l'`, but the frozen helper returns `'12,4'` (no unit). Each plan re-discovered this and patched at the component layer. A one-line note on the helper's contract would have saved the rework.
- **Empty SUMMARY one-liners + `requirements_completed` frontmatter.** Phases 9 and 10 left both empty, so the milestone-complete CLI emitted a noisy/placeholder accomplishment and the audit had to fall back to phase VERIFICATION for CAR-02/03/04 coverage. Thin audit trail; hand-fixed at close.

### Patterns Established
- **`—` null sentinel, never `R$ 0,00` / `0 km/l`.** No-data KPIs render an em-dash; zero is reserved for real zero. Applied uniformly across card + detail.
- **Magnitude bars ≠ adherence bars.** `CarroCategoriaBars` deliberately did NOT import `AdherenceBar` (its meta/progressbar semantics don't fit a meta-less magnitude); neutral `bg-muted-foreground` fill, never the semantic money tokens.
- **Inline aggregation when there's one consumer.** Phase 11's gasto-por-categoria summed `transactions` inline (RLS-scoped) instead of adding a view — one consumer didn't justify new SQL surface.

### Key Lessons
1. **Capture a convention the first time it bites.** The `.tsx` test-glob fix and the `kmPerLitroLabel` contract each cost rework twice in one milestone — both were one-liners that belonged in CONVENTIONS the moment they surfaced.
2. **`security_invoker` views are the clean cross-phase seam.** Phase 8's views were consumed unchanged by Phases 10 and 11 with zero type drift (`tsc` clean) — defining the contract at the DB boundary paid off.
3. **Avoid double-count by routing cost through one tag.** Linked-invoice fuel cost enters the car's total exactly once (via `transactions.carro_id`), never re-added from the abastecimento — the integration audit confirmed no double-count.
4. **A deferred "will-fix" note must be reconciled.** Phase 10 said WR-02 would be fixed by a "0029 view refinement in Phase 11"; Phase 11 knowingly shipped no 0029 and downgraded it to a documented limitation. The note was stale-but-tracked — close the loop explicitly so the audit doesn't read it as a silent drop.

### Cost Observations
- Model mix: not instrumented this milestone.
- Sessions: ~1 build session (phases 8–11 all executed 2026-06-17) + 1 close session (2026-06-18).
- Notable: Carro module added **zero new npm dependencies** — entirely on the v1.0/v1.1 substrate (Supabase, recharts, shadcn). Suite grew ~610→735 tests across the milestone.

---

## Milestone: v1.3 — Produção & PDF

**Shipped:** 2026-06-18 (app live in production — first git tag)
**Phases:** 2 (12–13) | **Plans:** 15 | **Tasks:** 18 | **Commits:** 76 (single-day sprint)

### What Was Built
- Production deploy — Supabase pessoal remoto (`sa-east-1`, migrations 0001-0030, RLS), Vercel (`gru1`, `maxDuration`), executing the six deferred `autonomous:false` walkthroughs (01-04…06-05) as one phase; login/session/RLS-isolation verified live (Phase 12, DEPLOY-01/02/03).
- Live core-value proof — real OFX in prod → server parse → review → **memory** classification → goal adherence monthly+annual, driven through the real browser (Phase 12, DEPLOY-04/05).
- 8 live-verify defects (G-01..G-08) — Base UI Select label-map, adherence truncation + stale-remote-view refresh (0030), calm under-teto copy, receitas delete, pt-BR `BrDateField`, honest import toast — via gap plans 12-08..12-11 + quick task + migration 0030.
- PDF de fatura — Santander parser (`getText`), third `ingestStatement` dispatch branch, image-only hard block, server-derived estorno `kind`, migrations 0031/0032, five review-UI surfaces (Phase 13, PDF-01..05).

### What Worked
- **Live-verify via Chrome DevTools MCP against the real prod URL.** Driving the actual deployed app — not just tests — is what *proved* the core value AND surfaced an 8-item punch-list (US date inputs, Select sentinel, stale remote view, missing receita delete) that static review and local tests had missed.
- **New format = parser + dispatch branch + CHECK widening, never a fork.** PDF reused the OFX/CSV pipeline verbatim; the only additions were one parser, one branch, two idempotent CHECK widenings, and UI. The integration check confirmed zero parallel path / review bypass.
- **Spike-before-build de-risked PDF.** The Santander spike chose `getText` over `getTable` and pinned the Node runtime before any build commitment — no serverless PDF foot-guns.
- **Deferred walkthroughs sequenced, not re-planned.** The six `autonomous:false` deploy plans ran in order as Phase 12 instead of being rewritten — the deferral held its value.

### What Was Inefficient
- **Stale remote migration state (D-10/G-03).** The pre-existing remote had 0014 applied at its old spend-driven body, so `db push` skipped re-running it → production served a stale adherence view (a teto with zero spend vanished). Required a higher-numbered no-op-bump migration (0030) purely to force the refresh.
- **"No redeploy" (D-08) broke on the first bug.** The single-deploy contract was optimistic; gap closure forced redeploy cycles anyway, and two cosmetic fixes (G-07/G-08) shipped GREEN locally but were never redeployed — a deferred item at close.
- **Checkbox/proven drift again.** DEPLOY-04/05 (and PDF-03) stayed `[ ]`/Pending after being proven live; the milestone audit had to reconcile VERIFICATION + SUMMARY vs REQUIREMENTS. Same thin-audit-trail issue flagged in v1.2 — recurred.

### Patterns Established
- **Live-verify-via-MCP is the verification spine for a deploy milestone** — the prod browser is the source of truth, not the local suite.
- **A higher-numbered no-op-bump migration is the only lever to refresh a stale remote view** that `db push` already considers applied (body changed, number didn't).
- **Server-derived `kind` read from the persisted base row, never the client payload** (WR-01 discipline extended to estorno→credit).

### Key Lessons
1. **Drive the real deployed app.** Live-verify found 8 defects local tests + static review missed; budget a verification phase that actually clicks through prod.
2. **A legacy remote DB diverges from repo migration history.** `db push` won't re-run an "applied" migration whose body changed — bump the number to force it. Provision fresh, or audit remote migration state before trusting `db push`.
3. **Reconcile checkboxes at phase close, not milestone close.** Proven≠checked drift cost an audit reconciliation for the second milestone running — flip the requirement state in the same commit that proves it.
4. **"No redeploy" is not a safe contract once live-verifying.** Plan for redeploy cycles when gaps surface; don't strand GREEN fixes undeployed.

### Cost Observations
- Single-day sprint (2026-06-18, ~8h), 76 commits, 100 files (+7829/-128).
- Model mix: not instrumented.
- Suite ~735 → ~761 tests. Only new deps: `pdf-parse` v2 + `unpdf` (PDF extraction).

---

## Milestone: v1.4 — IA de Classificação (BYOK)

**Shipped:** 2026-06-19
**Phases:** 4 (14–17) | **Plans:** 12 | **Tasks:** 17

### What Was Built
BYOK key storage (migration 0033: Vault `ai_settings` + RLS + decrypt-server-only RPCs) → memory-first batched AI classification in `suggestCategory()` (one enum-gated `classifyDescriptors` call per upload, never-throw fallback, no auto-commit, PII-safe descriptor_norm payload) → review-grid affordances (provenance memória/IA + confidence + low-confidence-first). Phase 17 cleared all v1.3 debt operationally, including a destructive PROD account delete (DATA-02) executed live.

### What Worked
- **Memory-first seam paid off:** the v1.3 `suggestCategory()` + `SuggestionSlot` seam made the AI wire additive — integration-checker found the 14→15→16 chain 100% wired, 0 defects, first pass.
- **Honest deferral of credential-gated smokes:** unit tests proved every no-key/error/enum-drift path; only the real-provider call + PROD push were marked `human_needed` rather than faked.
- **Safety-gated destructive op:** the SC3 runbook (5 ordered guard-rails) + read-only deploy-ancestry for SC1 (instead of a risky live re-confirm write) kept the personal PROD account safe until the user explicitly authorized the full delete.

### What Was Inefficient
- **Traceability drift:** BYOK/CLSAI rows sat at "Pending" and CLSAI wasn't in the 15/16 SUMMARY frontmatter — the audit had to reconcile reality vs the table. Mark requirements in SUMMARY frontmatter at execution time.
- **Stale cross-phase status:** Phase 12's `human_needed` + the import-grid-gaps quick task lingered as "open" until Phase 17 resolved them — the markers should flip when the resolving work lands, not at the next milestone close.

### Patterns Established
- **Operational/human-verify phase as `autonomous:false`** with a doc runbook + agent-driven non-destructive checks (browser MCP for read-only live-verify; deploy-ancestry for "is it in the bundle").
- **Pragmatic-retroactive Nyquist VALIDATION** for already-shipped phases: document what actually shipped + was verified, honest `nyquist_compliant`, no fabricated runs.

### Key Lessons
- Confirm "is the fix live" via git deploy-ancestry + a read-only bundle/behavior check before triggering any write on a real account.
- A deleted PROD account turns deferred live-smokes into re-setup work — sequence destructive cleanup AFTER pending live verification, not before.

### Cost Observations
- Model mix: ~100% opus (Opus 4.8 1M). Heavy subagent orchestration (planner/checker/executor/verifier/integration-checker) kept the main thread lean across the phase + full lifecycle.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.2 Carro | ~2 | 4 | First milestone formally audited + archived via the GSD lifecycle; clone-proven-grammar kept it zero-new-dep |
| v1.3 Produção & PDF | ~1 build + close | 2 | App went LIVE (first git tag); live-verify-via-MCP became the verification spine; new format (PDF) folded into the existing pipeline |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions |
|-----------|-------|--------------------|
| v1.2 Carro | ~735 | Yes (no new npm deps) |
| v1.3 Produção & PDF | ~761 | No — added `pdf-parse` v2 + `unpdf` (PDF only) |

### Top Lessons (Verified Across Milestones)

1. Front-load irreversible schema/invariants into a BLOCKING substrate phase; everything downstream consumes a stable contract.
2. Clone the proven grammar over inventing new UI — fewer decisions, fewer regressions, no new deps.
3. Reconcile requirement checkboxes in the same commit that proves them — proven≠checked drift forced an audit reconciliation in BOTH v1.2 and v1.3.
4. Drive the real deployed app to verify — live-verify caught defects that local tests + static review missed.
