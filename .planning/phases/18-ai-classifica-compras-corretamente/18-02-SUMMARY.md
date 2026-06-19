---
phase: 18-ai-classifica-compras-corretamente
plan: 02
status: deferred-human-verify
requirements:
  - MKT-01
completed: 2026-06-19
autonomous: false
---

# Plan 18-02 Summary — MKT-01 (Marketplace em PROD) — HUMAN-VERIFY PENDING

> **Status: DEFERRED — human-verify pending.** The CLSAI-09 code side (Plan 18-01) is
> done and verified. MKT-01's PROD verification is blocked on the owner's Supabase
> credentials + a PROD re-signup and was deferred by the user (2026-06-19).

## Task 1 — `supabase migration list` (read-only): ATTEMPTED, BLOCKED

The orchestrator ran the read-only check itself (no code, no mutation):

```
$ npx supabase migration list
Initialising login role...
Invalid access token format. Must be like `sbp_0102...1920`.
```

- The project IS linked (`supabase/.temp/project-ref` → `pnjzrmlqyebyeecxvfzu`), but there
  is **no valid `SUPABASE_ACCESS_TOKEN` in this environment**, so the remote (PROD) state
  of migration `0035` **could not be determined**.
- Per the locked decision (CONTEXT.md), Claude does **not** run `supabase db push` against
  PROD — and here Claude additionally cannot even read remote migration state without the
  owner's token. → escalated to the human-verify checkpoint (Task 2).

## Task 2 — Human-verify (MKT-01): DEFERRED by user

`0035` is a **data + trigger** migration (no schema change → no `gen:types`,
`database.types.ts` untouched; no new migration created). PROD was wiped 2026-06-19, so
"present in account" requires a re-signup. This is human-verify by definition (PROD data +
wipe → not automatable from this environment).

**Outstanding steps for the owner (run from the PROD-linked environment):**

1. `supabase db push` (or `npm run db:push`) — applies `0035` if `0035` is absent from the
   Remote column of `supabase migration list`. *(In a Claude Code session you can run it as
   `! supabase db push` so output lands in the session.)*
2. Re-signup in PROD + re-enter the BYOK key in Settings — the re-seeded `handle_new_user`
   (part 1 of `0035`) creates "Marketplace"; the idempotent backfill (part 2) covers any
   pre-existing account.
3. `/categorias` → confirm "Marketplace" (consumo) is listed.
4. Upload an OFX with a never-seen marketplace descriptor (AliExpress / Mercado Livre /
   Shopee) → confirm the AI suggestion is a **consumo** category, never Investimentos/Reserva.

Reply "aprovado" once "Marketplace" appears and the suggestion is consumo; otherwise
describe what you saw (e.g. `0035` did not apply, or the suggestion landed on alocação).

## must_haves status

| must_have | status |
|-----------|--------|
| `0035` applied in PROD (Remote column) | ⏳ pending — owner runs `db push`; not verifiable in this env |
| "Marketplace" (consumo) in /categorias after re-signup | ⏳ pending — owner re-signup |
| Marketplace descriptor → consumo suggestion (never alocação) | ⏳ pending PROD; **structurally guaranteed** by the 18-01 kind gate (an alocação id is nulled for any spending descriptor) + the now-present Marketplace consumo bucket |

## Prohibitions honored

- ✅ Claude never ran `supabase db push` against PROD (only the read-only `migration list`, which itself was blocked by missing auth).
- ✅ No `npm run gen:types` / `database.types.ts` regen.
- ✅ No new migration created (`0035` already exists in the repo).

## Cross-reference

- **Plan 18-01 (CLSAI-09) — done & verified:** the kind-aware prompt + the post-`validateSuggestion`
  code gate mean that even before MKT-01 is confirmed, the AI can **never** assign an alocação
  category to a spending descriptor (it returns `null` instead). MKT-01 adds the sensible
  *consumo* target ("Marketplace") so those descriptors land somewhere good rather than `null`.
