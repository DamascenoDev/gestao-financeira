# Milestones

## v1.2 Carro (Shipped: 2026-06-18)

**Phases completed:** 4 phases, 13 plans, 17 tasks

**Key accomplishments:**

- Carro data substrate: `carros` + `abastecimentos` tables, the nullable non-accounting `transactions.carro_id` tag, two `security_invoker` consumption views (km/l + R$/km), the cost XOR CHECK + partial unique index, uniform RLS — applied to the local stack with a no-drift typed client and Wave-0 cross-user isolation proofs.
- The typed, validated, IDOR-safe Carro write boundary: `carroSchema` (apelido required + the four optional fields + the fixed combustivel enum), `assertOwnedCarro` (exactly-1-row RLS re-derive in the shared ownership module), and the four `createCarro`/`updateCarro`/`archiveCarro`/`unarchiveCarro` server actions — every write Zod-gated, session-gated, ownership-re-derived before touching a row, returning `{ ok } | { error }` without ever throwing — mirroring the proven reservas/MEI grammar exactly.
- The user-facing Carro slice that closes CAR-01 + CAR-06: a "Carros" nav entry (sidebar after Reservas + bottom-nav 6th mobile item, lucide `Car`), the `CarroForm` create/edit Dialog and identity-only `CarroCard` (both cloned verbatim from the reservas grammar and wired to the Plan-02 actions), the `/carros` list RSC (RLS-scoped read + `?arquivados=1` Switch filter + responsive CarroCard grid + Car-icon Empty + inline error), and the minimal `/carros/[id]` identity detail (definition list + Editar/Arquivar header actions, `notFound()` on a foreign/missing id) — identity only, zero money/KPIs (deferred to Phases 9-11), zero new visual primitives, zero new npm deps.
- Non-destructive expense→car tagging (CAR-02, D4): an optional `carro_id` lens on any expense via the transaction form, an "Vincular a carro" row action + bulk action on the extrato, and per-row tagging in the import-review — every write `assertOwnedCarro`-re-derived (IDOR-safe), and tagging/untagging never touches the row's category, value, or goal math (proven byte-identical by a Wave-0 integration test).
- Hybrid fueling log + consumption math (CAR-03/04): `abastecimento` entries with odometer/liters/full-tank flag/fuel type, cost from EITHER a linked invoice transaction OR a manual amount (exactly one, enforced by a DB CHECK XOR + server validation), feeding two `security_invoker` views that compute km/l by the full-tank method and R$/km per interval, exposed as per-car averages.
- Two pure-data Phase-11 presentation leaves — a token-aware recharts km/l-over-time LineChart (pt-BR tooltip, null/0-interval drop, empty state) and a neutral gasto-por-categoria magnitude-bar list (valor-desc, formatCents mono label) — each behind a Wave-0-tested prop contract.
- The /carros list now shows real gasto total + km/l médio per card, read from the existing `v_carro_resumo` (RLS-scoped), with the `—` sentinel for no-data — completing the deferred Phase-8 identity-only card promise without touching its identity/actions.
- The `/carros/[id]` detail page is now the full CAR-05 capstone — header, 3 KPI cards (km/l médio · R$/km · gasto total), an inline RLS-scoped gasto-por-categoria magnitude-bar section, the km/l-over-time consumption line chart, and the integrated Phase-10 AbastecimentoHistory — in UI-SPEC section order, with the SEC-01 bundle-secret audit re-run GREEN against a fresh build now that a chart client component is in the bundle.

**Requirements:** CAR-01..06 — 6/6 satisfied (audit: `milestones/v1.2-MILESTONE-AUDIT.md`). Cross-phase integration ship-ready, headline E2E flow complete, no double-count.

**Tech debt carried forward (accepted at close):**
- WR-02 — `v_abastecimento_consumo` understates km/l / overstates R$/km when two full-tank fills share the EXACT same odometer (near-impossible single-user data shape; isolated to one car's consumption average; `gasto_total_cents` unaffected). Fix = future migration 0029.
- Doc hygiene — CAR-02/03/04 absent from per-plan SUMMARY `requirements_completed` frontmatter (carried by checkbox + phase VERIFICATION instead).

**Status:** Code-complete on the LOCAL Supabase stack. **Not deployed** — no git tag created. The deferred `autonomous:false` remote-wiring + Vercel deploy + live-verify walkthroughs (01-04, 02-05, 03-06, 04-04, 05-04, 06-05) remain open pending user credentials; tag v1.2 at real release.

---
