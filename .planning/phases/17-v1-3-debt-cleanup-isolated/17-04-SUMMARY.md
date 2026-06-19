---
phase: 17-v1-3-debt-cleanup-isolated
plan: 04
status: complete
requirements_completed: [DATA-02]
requirement: DEBT-05
autonomous: false
executed_on: 2026-06-19
executed_by: orchestrator via browser MCP — user authorized ("pode deletar tudo… não fiz os cadastros ainda, não tem problema apagar tudo")
production_url: https://gestao-financeira-ebon-mu.vercel.app/conta
---

# 17-04 — SC3 destructive account delete (DATA-02) — COMPLETE (executed)

Initially deferred at the 17-04 checkpoint, then the user explicitly authorized deleting the entire
PROD account: the account held only test data from the phase-12 verification (no real cadastros yet),
so a full delete — including the auth login — was acceptable. The orchestrator drove the delete via the
browser MCP (overriding the earlier "agent never runs this" default per the user's explicit instruction).

## Execution evidence (live PROD, Chrome DevTools MCP, 2026-06-19)

- **Consequences dialog** (read before acting): deletes all transações/receitas/categorias/metas/reservas,
  all MEI data, learned classification patterns, all uploaded faturas in storage, **and the access account
  itself (login + senha)** — nothing recoverable.
- **Guard-rail 3 (type-to-`APAGAR` gate)** ✓ — initial focus on **Cancelar**; "Apagar conta" button
  **disabled** while empty AND while lowercase `apagar` was typed; **enabled only on the exact uppercase
  `APAGAR`**. Verified step by step.
- **Guard-rail 4 (PROD-site-only)** ✓ — executed at `https://gestao-financeira-ebon-mu.vercel.app/conta`,
  never the dev server.
- **Guard-rail 5 (cascade + signout)** ✓ — button showed **"Apagando…"**, network trail
  `POST /conta [200]` (delete server action) → `POST /conta [303]` (post-success redirect) →
  landed on **`/auth/login`** with the sign-in form. Account deleted and session ended.

## Guard-rails not applicable / waived this run

- **Guard-rail 1 (DB backup before)** — **waived by the user** (data declared disposable). The orchestrator
  has no Supabase dashboard access to take a backup; this was an accepted risk.
- **Guard-rail 2 (separate throwaway account)** — N/A. There was a single account holding only test data;
  the user authorized deleting it directly rather than spinning up a separate throwaway. The
  personal-vs-throwaway isolation sub-check (and the optional DB row-count verification) requires dashboard
  access and is moot with one account.

## Result

DATA-02 destructive delete path is **proven end-to-end in production**: the type-to-`APAGAR` gate, the
RLS-scoped cascade delete server action, and the sign-out all work. DEBT-05 is now fully complete (doc
half = runbook 17-03; execution half = this delete). Phase 17 is fully complete.

**User follow-up:** to use the app again, sign up a fresh account (`/auth/signup`) and re-enter the BYOK
AI key (it was deleted with the rest of the data).
