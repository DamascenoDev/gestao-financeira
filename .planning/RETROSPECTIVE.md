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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.2 Carro | ~2 | 4 | First milestone formally audited + archived via the GSD lifecycle; clone-proven-grammar kept it zero-new-dep |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions |
|-----------|-------|--------------------|
| v1.2 Carro | ~735 | Yes (no new npm deps) |

### Top Lessons (Verified Across Milestones)

1. Front-load irreversible schema/invariants into a BLOCKING substrate phase; everything downstream consumes a stable contract.
2. Clone the proven grammar over inventing new UI — fewer decisions, fewer regressions, no new deps.
