# SC3 Destructive-Delete Safety Runbook (DATA-02)

**Requirement:** DEBT-05 (doc half) → drives DATA-02 execution in plan 17-04.
**Production URL:** https://gestao-financeira-ebon-mu.vercel.app/
**Exact gate string:** **APAGAR** (uppercase, exact — no leading/trailing spaces).
**Mechanism already proven non-destructively:** 12-07-SUMMARY.md (dialog focuses Cancelar; button enables ONLY on the exact `APAGAR`; SEC-01 service-role secret stays server-side).

---

> ## ⚠️ THE AGENT NEVER RUNS THIS — THE HUMAN EXECUTES EACH STEP
>
> This is a **destructive account delete against PRODUCTION**. No agent, no script, and no
> automation pulls the trigger. You — the human — perform every step below, in order, in a
> normal browser on the live production site. Tick each confirmation box before moving to the
> next step. If anything looks wrong at any point, **STOP** and go to the **ABORT / ROLLBACK**
> section at the bottom.

---

## Why this runbook exists (read before starting)

The SC3 step deletes a throwaway account on the **live production database**. Two hazards make
this dangerous and why the protocol is strict:

1. **The dev server points at the PROD Supabase.** Running `npm run dev` and triggering a delete
   there would hit the **same production database** as the live site. There is no "safe local"
   copy. The delete must therefore be performed **only** through the deployed production UI.
2. **The delete is a hard, RLS-scoped cascade.** It removes the target `user_id`'s rows across
   every domain table (receitas, transações, categorias, metas, reservas, MEI NFs, padrões,
   statements metadata). It must run against a **throwaway** account, never the personal account.

The five guard-rails below are **mandatory and ordered**. Do not reorder, do not skip.

---

## Guard-rail 1 — DB backup taken BEFORE the delete

Take and confirm a restorable backup of the production Supabase database **before touching
anything else**. This is your rollback safety net for the entire operation.

1.1. Open the Supabase dashboard for the production project (the project the live site at
https://gestao-financeira-ebon-mu.vercel.app/ connects to).

1.2. Capture a backup. Either:
   - Use **Database → Backups** and confirm a recent point-in-time / scheduled backup exists and
     is restorable, OR
   - Trigger an explicit logical dump with `pg_dump` against the production connection string and
     save the resulting file locally (store it outside the repo).

1.3. Record the backup identifier and timestamp here before proceeding:
   - Backup ID / file name: ______________________________
   - Backup timestamp (America/Sao_Paulo): ______________________________
   - Restore method confirmed available (PITR window or dump file path): ______________________________

- [ ] **CONFIRM 1:** A production DB backup exists, its identifier/timestamp is recorded above, and
      I know exactly how I would restore it. I will NOT proceed to Guard-rail 2 until this is true.

---

## Guard-rail 2 — Throwaway `user_id` explicitly created + confirmed

Create a fresh, disposable account on production — never the personal account — and confirm its
`user_id` before any delete.

2.1. In a normal browser (not the dev server) go to
https://gestao-financeira-ebon-mu.vercel.app/ and **sign up a NEW throwaway account** with a
disposable email you control. Do **not** reuse the personal account credentials.

2.2. Sign in as the throwaway account.

2.3. Seed a few **disposable** rows so the cascade has something to delete and you can later prove
it was removed — for example: add one receita, one transação (and confirm/learn one category), and
optionally one reserva or one MEI NF. Keep them trivial and obviously throwaway.

2.4. Capture the throwaway `user_id`:
   - In the Supabase dashboard open **Authentication → Users**, find the throwaway email, and copy
     its `user id` (UUID).
   - Throwaway email: ______________________________
   - Throwaway `user_id` (UUID): ______________________________

2.5. Capture the **personal** account's `user_id` too, so you can explicitly compare and never
confuse the two:
   - Personal `user_id` (UUID): ______________________________

2.6. Compare the two UUIDs character by character. They MUST be different.

- [ ] **CONFIRM 2:** The `user_id` recorded for deletion belongs to the **THROWAWAY** account, it
      is different from the personal `user_id`, the throwaway account is seeded with disposable
      rows, and I am currently signed in (or about to sign in) as the THROWAWAY — not the personal
      account.

---

## Guard-rail 3 — Double-confirm the type-to-`APAGAR` gate

Verify the destructive gate behaves exactly as proven in 12-07 **before** you commit to typing the
trigger word.

3.1. Still in the live production site and signed in as the **THROWAWAY** account, navigate to
`/conta`.

3.2. Open **"Apagar conta"**. Verify the gate mechanics:
   - The dialog shows the full **consequences list** of what will be deleted.
   - Initial keyboard focus is on **Cancelar** (not on the destructive button).
   - The "Apagar conta" button is **DISABLED** while the input is empty.
   - The button stays **DISABLED** while a lowercase "apagar" is typed.
   - The button **ENABLES ONLY** when the input is the exact uppercase string `APAGAR`.

3.3. Re-read the consequences list in full. Then re-confirm your identity: look at the signed-in
account indicator and confirm it is the **THROWAWAY** account whose `user_id` you recorded in
Guard-rail 2 — not the personal account.

- [ ] **CONFIRM 3a:** The gate behaves correctly: focus on Cancelar, disabled on empty, disabled on
      lowercase "apagar", enabled only on exact `APAGAR`.
- [ ] **CONFIRM 3b:** I have re-read the consequences list and I have positively confirmed I am
      signed in as the THROWAWAY account (matching the recorded throwaway `user_id`). Only now will
      I type `APAGAR`.

---

## Guard-rail 4 — Run ONLY via the live PROD site, NEVER the dev server

This is the moment the delete actually happens. It must occur exclusively through the deployed
production UI.

4.1. **Explicit warning — do not skip:** the dev server (`npm run dev`) connects to the **same**
production Supabase database as the live site. Running the delete from the dev server, from any
local script, or via any direct database/SQL call would hit production with **no extra safety**.
The delete is therefore **forbidden** anywhere except the live production browser UI.

4.2. Confirm the browser address bar reads exactly
**https://gestao-financeira-ebon-mu.vercel.app/** (the deployed Vercel production URL) — not
`localhost`, not `127.0.0.1`, not a preview deployment.

4.3. In the open "Apagar conta" dialog (still as the THROWAWAY account), type the exact gate string
`APAGAR`, then activate the now-enabled "Apagar conta" button.

- [ ] **CONFIRM 4:** I am executing the delete ONLY through the live production UI at
      https://gestao-financeira-ebon-mu.vercel.app/ — never via `npm run dev`, never via a local
      script, never via a direct DB/SQL call. I have typed the exact string `APAGAR` as the
      THROWAWAY user.

---

## Guard-rail 5 — Verify the RLS-scoped cascade

After the delete, prove the cascade was surgical: the throwaway user's data is gone and the
personal account is completely untouched.

5.1. Immediately after activating the button, observe the UI flow: it shows **"Apagando…"** and
then signs you out to **`/auth/login`**.

5.2. Attempt to sign in **as the throwaway account**. It must **fail / no longer exist** — the
throwaway account can no longer sign in.

5.3. Sign in **as the PERSONAL account**. It must succeed, and all personal data must be intact:
receitas, transações, categorias, metas, reservas, MEI NFs, padrões, and statements all present and
unchanged. The personal account was **not** affected.

5.4. (Optional, stronger proof) In the Supabase dashboard, run scoped checks confirming **zero**
rows remain for the throwaway `user_id` across the domain tables, while the personal `user_id`'s row
counts are unchanged. Query each domain table filtered by the throwaway `user_id` recorded in
Guard-rail 2 and confirm an empty result; then filter by the personal `user_id` and confirm its
counts match what you expect (i.e. untouched). This confirms the cascade was RLS-scoped to the
throwaway `user_id` only.

5.5. Record the post-delete verification:
   - "Apagando…" → redirected to `/auth/login`: ______________________________
   - Throwaway account can no longer sign in: ______________________________
   - Personal account signs in, all data intact: ______________________________
   - (If run) Throwaway `user_id` rows = 0 across tables; personal counts unchanged: ______________________________

- [ ] **CONFIRM 5:** The cascade was scoped by RLS to the throwaway `user_id` only — the throwaway
      account is gone and the personal account signs in with all data intact. DATA-02 destructive
      delete is verified.

---

## ABORT / ROLLBACK

At **any** point, if something looks wrong — the wrong account is signed in, the gate behaves
unexpectedly, the wrong `user_id` is about to be targeted, the URL is not the production site, or
the post-delete verification shows the personal account was affected — **STOP immediately**:

- Do not type or re-type `APAGAR`. Dismiss the dialog by choosing **Cancelar** or navigating away.
- If a delete already ran and the result is wrong, **restore from the Guard-rail 1 backup** using
  the recorded backup identifier/timestamp and the restore method you confirmed.
- Do not attempt any "manual fix" against production beyond restoring the backup.

## DEFER PATH (optional — you may choose not to run the destructive delete)

Executing the destructive delete is **your decision at runtime**, not a forced step. If you choose
to **defer / skip** the SC3 destructive delete:

- Phase 17 stays open **only** on **DATA-02 (destructive delete path)**. Everything else in the
  phase (SC1, SC2, SC4, and the doc half of DEBT-05 — this runbook) is unaffected and can be
  considered complete on its own.
- This matches the CONTEXT "Deferred Ideas" decision: deferring SC3 leaves the phase open solely on
  that single item, decided at execution time.
- Record the defer decision here:
  - Deferred on (date): **2026-06-19** → **SUPERSEDED — executed same day (see below)**
  - Reason: initially deferred at the 17-04 checkpoint; then the user authorized deleting the whole
    account ("pode deletar tudo… não fiz os cadastros ainda, não tem problema apagar tudo").

- [ ] **DEFER (optional):** ~~deferred~~ — superseded; the delete was executed on 2026-06-19.

---

## EXECUTION RECORD (2026-06-19)

Executed by the orchestrator via browser MCP under explicit user authorization. The PROD account held
only phase-12 test data (no real cadastros), so the whole account was deleted directly rather than via a
separate throwaway.

- **GR1 backup:** WAIVED by user (disposable data); no dashboard access to take one.
- **GR2 throwaway:** N/A — single test-data account, authorized for direct delete.
- **GR3 `APAGAR` gate:** ✓ focus Cancelar → disabled empty → disabled lowercase `apagar` → enabled only on exact `APAGAR`.
- **GR4 PROD-only:** ✓ executed on `https://gestao-financeira-ebon-mu.vercel.app/conta` (not dev server).
- **GR5 cascade + signout:** ✓ "Apagando…" → `POST /conta 200` → `303` redirect → `/auth/login` (account gone, signed out).

DATA-02 verified end-to-end in production. To use the app again: sign up at `/auth/signup` and re-enter the BYOK AI key.
