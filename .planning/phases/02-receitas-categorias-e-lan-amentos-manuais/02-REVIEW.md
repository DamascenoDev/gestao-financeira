---
phase: 02-receitas-categorias-e-lan-amentos-manuais
reviewed: 2026-06-16T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - supabase/migrations/0004_incomes.sql
  - supabase/migrations/0005_transactions.sql
  - supabase/migrations/0006_categories_color.sql
  - supabase/migrations/0007_views.sql
  - supabase/migrations/0008_reassign_and_delete.sql
  - src/actions/incomes.ts
  - src/actions/categories.ts
  - src/actions/transactions.ts
  - src/lib/money.ts
  - src/lib/month.ts
  - src/lib/schemas/income.ts
  - src/lib/schemas/category.ts
  - src/lib/schemas/transaction.ts
  - src/app/(app)/receitas/page.tsx
  - src/app/(app)/extrato/page.tsx
  - src/app/(app)/categorias/page.tsx
  - src/components/transacao-form.tsx
  - src/components/receita-form.tsx
findings:
  critical: 0
  high: 3
  medium: 4
  warning: 6
  total: 13
status: findings
---

# Phase 2: Code Review Report — Receitas, Categorias e Lançamentos Manuais

**Reviewed:** 2026-06-16
**Depth:** deep (cross-file: actions ↔ migrations ↔ RLS ↔ views)
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The RLS substrate is genuinely strong: every new table (`income_templates`, `income_occurrences`, `transactions`) has RLS enabled with matching `USING` + `WITH CHECK`, `TO authenticated`, the mandatory table grants, and a `user_id` index. Both aggregate views are `security_invoker = true` (the cross-user sum-leak vector is closed and proven by `view-leak.test.ts`). FK `ON DELETE RESTRICT` on `transactions.category_id` is present, and the `reassign_and_delete_category` RPC is correctly `security invoker` so the move+delete is one atomic transaction scoped to the caller's own rows. Money is bigint centavos throughout, and `parseBRLToCents` throws rather than returning silent NaN/0.

However, this review found a real, recurring **broken-object-level-authorization (IDOR) on the `category_id` *value*** that RLS does not and cannot close: across `createTransaction`, `updateTransaction`, `bulkReclassify`, and `reassignAndDelete`, the server trusts a client-supplied `category_id`/`dst` after only a `uuid()` shape check. RLS scopes *which rows are written* (the caller's own transactions), but it does **not** validate the *foreign-key target* — a forged id pointing at another user's category passes the FK (the row exists globally) and silently attaches the caller's financial data to a category they do not own. This is the highest-impact class of finding here. A second-tier set of issues concerns money sign/zero validation (negative/zero amounts rely entirely on a DB CHECK that differs between tables) and a few correctness/robustness gaps.

No CRITICAL (no secret leak, no SQLi, no auth bypass, no RLS hole). Findings are graded HIGH / MEDIUM / WARNING.

---

## High

### HG-01: `category_id` foreign-key target is never verified to belong to the caller (IDOR on category ownership)

**Files:**
- `src/actions/transactions.ts:61-68` (createTransaction)
- `src/actions/transactions.ts:104-112` (updateTransaction)
- `src/actions/transactions.ts:153-156` (bulkReclassify)
- `src/lib/schemas/transaction.ts:12` (`categoryId: z.string().uuid()` — shape only)

**Issue:** The `category_id` written to `transactions` is validated only as a well-formed UUID. RLS on `transactions` constrains *which transaction rows* the caller may write (their own), but Postgres foreign keys are **not** RLS-aware — the FK `category_id references public.categories(id)` is satisfied by *any* existing category row, including another user's. A malicious or buggy client can therefore POST a `categoryId` belonging to user B; the insert/update succeeds, and the caller's transaction is now linked to a category they do not own. Downstream, `v_category_totals` joins by `category_id` and the Categorias/Extrato pages `Map`-lookup category names locally, so the foreign category renders as "Sem categoria" for the caller while still being a cross-tenant reference in the row. For a financial app with a documented "spouse joins later" multi-user roadmap, this is a latent data-integrity / isolation defect that ships now and bites at multi-user.

**Fix:** Re-derive ownership of the category server-side before writing. Cheapest robust fix is an existence check scoped by the RLS-active client (which only returns the caller's own rows):

```ts
// in createTransaction / updateTransaction, after getClaims():
const { data: cat } = await supabase
  .from('categories')
  .select('id')
  .eq('id', parsed.data.categoryId)
  .maybeSingle()
if (!cat) return { error: 'Categoria inválida.' }
```

For `bulkReclassify`, do the same single existence check on `categoryId` before the `.update().in('id', ids)`. (A DB-level alternative is a composite FK `(user_id, category_id) references categories(user_id, id)` plus a unique key on `categories(user_id, id)`, which makes the database itself reject a cross-user target.)

---

### HG-02: `reassignAndDelete` / `reassign_and_delete_category` does not validate that `dst` belongs to the caller

**Files:**
- `src/actions/categories.ts:200-216` (reassignAndDelete)
- `supabase/migrations/0008_reassign_and_delete.sql:19-24` (the RPC body)

**Issue:** Same root cause as HG-01, on the destination of a reassign. The action checks `src !== dst` and that both are truthy, then calls the RPC. The RPC runs `update public.transactions set category_id = dst where category_id = src`. RLS correctly scopes the UPDATE to the caller's own transactions, but `dst` is written verbatim as the new FK value with no ownership check. A forged `dst` that is a valid category id belonging to **another user** passes the FK and reassigns all of the caller's transactions in `src` to a foreign category — then deletes `src`. The accompanying test (`tests/category-delete.test.ts`) only exercises the happy path (own src → own dst); there is no negative test for a cross-user `dst`.

**Fix:** Validate `dst` (and `src`) ownership before invoking the RPC, or inside it. In the action:

```ts
const { data: ok } = await supabase
  .from('categories')
  .select('id')
  .in('id', [src, dst])
if (!ok || ok.length !== 2) {
  return { error: 'Selecione uma categoria de destino diferente.' }
}
```

Better, harden the RPC so the guarantee lives at the data layer (RLS-visible `categories` inside `security invoker`):

```sql
create or replace function public.reassign_and_delete_category(src uuid, dst uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.categories where id = dst)
     or not exists (select 1 from public.categories where id = src) then
    raise exception 'categoria inexistente ou sem permissão';
  end if;
  update public.transactions set category_id = dst where category_id = src;
  delete from public.categories where id = src;
end; $$;
```

Because the function is `security invoker`, the `exists` checks run under the caller's RLS, so a foreign `dst` is treated as non-existent and the whole transaction aborts.

---

### HG-03: Negative and zero money amounts are accepted by the parser/schemas; only an inconsistent DB CHECK stops them

**Files:**
- `src/lib/money.ts:14-25` (parseBRLToCents — no sign/zero guard)
- `src/lib/schemas/transaction.ts:11`, `src/lib/schemas/income.ts:11,19,25` (amount is `z.string().min(1)` only)
- `supabase/migrations/0004_incomes.sql:16,29` (`amount_cents >= 0` — allows **zero**)
- `supabase/migrations/0005_transactions.sql:15` (`amount_cents > 0` — stricter)

**Issue:** `parseBRLToCents("-10,00")` returns `-1000`; `parseBRLToCents("0,00")` returns `0`. Neither the shared Zod schemas nor the actions reject these — the only backstop is the table CHECK constraint, and that backstop is **inconsistent**:
- `transactions.amount_cents > 0` rejects both negative and zero (good, but surfaces as a generic "Não foi possível salvar a transação." DB error, not a field-level message).
- `income_*.amount_cents >= 0` **accepts zero**, so a R$ 0,00 receita/template is persistable, silently materializes a zero occurrence every month, and pollutes `v_income_month` / "receita líquida do mês". A negative income is blocked by the `>= 0` check, again only as a generic DB error.

The doc-comment on `money.ts` claims the parser is the "money-corruption vector" guard, but it does not enforce the app's actual invariant (`amount_cents > 0`). Relying on divergent DB CHECKs to enforce a core money rule is fragile and produces poor UX (no field error).

**Fix:** Enforce positivity once, at the parse/validation boundary, and align the income CHECK with transactions:

```ts
// money.ts — make positivity an explicit, single-source rule
const cents = Math.round(value * 100)
if (!Number.isFinite(value) || normalized === '' || cents <= 0) {
  throw new Error(`Valor monetário inválido: "${input}"`)
}
return cents
```

And in `0004_incomes.sql`, tighten both columns to `check (amount_cents > 0)` (a new migration; zero-value receitas are not a real domain case). This makes the rule consistent across tables and gives the user the friendly "Valor monetário inválido." path already wired in the actions.

---

## Medium

### MD-01: `reassign_and_delete` allows mixing category `kind` (consumo ↔ alocação), corrupting totals semantics

**Files:** `src/actions/categories.ts:200-216`, `src/components/category-delete-dialog.tsx:62-63,149-173`

**Issue:** The delete dialog offers *every* other active category as a reassign target regardless of `kind`. Reassigning a `consumo` category's transactions into an `alocacao` category (or vice-versa) silently reclassifies "gastos de consumo" as "alocação", which is exactly the consumo-vs-alocação distinction the app exists to track (CAT-03, adherence metrics). No validation prevents it. This is a domain-correctness bug, not just style — the resulting category totals are wrong for goal/adherence reporting.

**Fix:** Filter reassign targets to the same `kind` as the source category, and re-assert it server-side (the page already has `kind` in scope on `categorias/page.tsx`). At minimum, surface a confirmation when kinds differ. Carry `kind` into `TargetCategory` and `reassignTargets = targets.filter(t => t.id !== category.id && t.kind === category.kind)`.

### MD-02: `ensureMonthOccurrences` materializes occurrences for **any** month string with no validation

**File:** `src/actions/incomes.ts:56-82`; caller `src/app/(app)/receitas/page.tsx:44-48`

**Issue:** `ReceitasPage` passes `params.mes ?? currentMonthKey()` straight into `ensureMonthOccurrences(mes)`, which feeds `mes` into `occurredOnFor` (→ `monthBounds` → `date-fns parse`) and writes `month_key: monthKey` into `income_occurrences`. The DB CHECK `month_key ~ '^\d{4}-\d{2}$'` is the only guard. A crafted `?mes=2026-99` or `?mes=garbage` makes `parse()` produce an `Invalid Date`; `format()` then yields `'NaN'`-ish output or throws, and `occurredOnFor` can emit a malformed `occurred_on`. Best case the DB CHECK rejects it (generic failure, page still renders the rest); worst case `date-fns` coerces it into a wrong-but-valid month and silently materializes occurrences in the wrong period. The same unvalidated `mes` flows into the Extrato/Categorias month math.

**Fix:** Validate `mes` against `^\d{4}-(0[1-9]|1[0-2])$` at the page boundary and fall back to `currentMonthKey()` on mismatch (a tiny `isMonthKey()` in `lib/month.ts`), so no unvalidated month string reaches the DB or `date-fns`.

### MD-03: Generic DB-error swallowing hides constraint failures the user must act on

**Files:** `src/actions/transactions.ts:69,113,157`; `src/actions/categories.ts:70,94,116,138,158,189,216`; `src/actions/incomes.ts:124-145,184,217,257,273`

**Issue:** Every action collapses any DB error into one fixed Portuguese string and discards `error.code`/`error.message`. Two concrete consequences: (1) the `transactions.amount_cents > 0` and `income amount_cents >= 0` CHECK violations (HG-03) surface as "Não foi possível salvar…" instead of a money-specific message; (2) the documented 23503 FK-restrict backstop in `deleteCategory` (categories.ts:186-189) is caught by the same generic branch, so the "race: a transaction landed" case is indistinguishable from a real failure. The comments claim differentiated handling that the code does not implement.

**Fix:** Branch on `error.code` for the cases the comments promise — at minimum map `23514` (check_violation) to "Valor monetário inválido." and `23503` (foreign_key_violation) in `deleteCategory` to the blocked/race message. Keep the generic fallback for everything else. Do not log raw `error` to the client.

### MD-04: `formatCents(Number(total_cents))` silently truncates totals above `Number.MAX_SAFE_INTEGER`

**Files:** `src/app/(app)/receitas/page.tsx:69,81,151`; `src/app/(app)/extrato/page.tsx:81,100,105`; `src/components/extrato-table.tsx`

**Issue:** `money.ts` was deliberately hardened so `formatCents` keeps bigint precision above `MAX_SAFE_INTEGER` (MD-01 comment in the lib). But every call site first does `Number(liquida?.total_cents ?? 0)` / `Number(t.total_cents)` / `Number(t.amount_cents)`, converting the bigint sum to a JS number *before* it reaches `formatCents`. That conversion is the exact lossy step the lib tries to avoid: a monthly sum beyond ~9.0e15 centavos (R$ 90 trilhões) loses precision here, and `formatCents`'s own `Number.isSafeInteger` guard is bypassed because the value already arrived as a (possibly already-rounded) number. The bigint-safe path in `formatCents` is therefore dead for these aggregate values.

**Fix:** Pass the raw bigint/string straight through. supabase-js returns `bigint` columns as `string` or `number`; keep them as `string`/`bigint` and let `formatCents` (which already accepts `number | bigint`) handle the split — `formatCents(BigInt(liquida?.total_cents ?? 0))`. Avoid the intermediate `Number(...)` for any value that feeds `formatCents`.

---

## Warnings

### WR-01: `monthKeyFromDate` derives `month_key` by string slice, decoupled from the civil-month helper

**File:** `src/actions/incomes.ts:43-45`, used at `:181`

**Issue:** Avulsa `month_key` is `occurredOn.slice(0, 7)`, bypassing the `America/Sao_Paulo`-pinned `lib/month.ts` that the rest of the app routes through specifically to avoid month-boundary bugs (the file's whole reason to exist). Since `occurredOn` is a civil `yyyy-MM-dd` from a date input, the slice happens to be correct today — but it is an off-pattern shortcut that will silently diverge if the date source ever becomes a timestamp.

**Fix:** Route through the helper (e.g. add/export a `monthKeyOf(dateStr)` in `lib/month.ts`) so there is one owner of month-key derivation.

### WR-02: `currentAmount` / `centsToRawBRL` round-trips cents through float for prefill

**Files:** `src/app/(app)/receitas/page.tsx:31-36`, `src/components/extrato-table.tsx:72-77`

**Issue:** `(cents / 100).toLocaleString('pt-BR', …)` converts the stored integer cents to a float before formatting the edit-form prefill. For normal values this is fine, but it is the same "no float in money" discipline leak the project explicitly forbids, and on inline category-only edits (`extrato-table.tsx:98`) the prefill is sent *back* through `parseBRLToCents` on save — so any rounding drift would persist. Low likelihood at realistic magnitudes, but it defeats the integer-cents invariant on the write path.

**Fix:** Format the prefill from the bigint via the existing integer-safe split (a `centsToEditableBRL(cents)` that does `String(cents/100n)` + `,` + 2-digit remainder), or carry the raw amount string rather than reconstructing it.

### WR-03: `createIncomeTemplate` reads `monthKey` from `FormData` with an unchecked `as string` cast

**File:** `src/actions/incomes.ts:105-106`

**Issue:** `(formData.get('monthKey') as string | null) ?? currentMonthKey()` casts a `FormDataEntryValue | null` to `string`. A `File` entry (or any non-string) would slip past the type system and be written as `month_key`, again relying on the DB CHECK. Minor given the form always sends a string, but it is an unchecked cast in a money-write path.

**Fix:** `typeof raw === 'string' ? raw : currentMonthKey()` and validate against the month-key regex (see MD-02).

### WR-04: `updateTemplate` reconstructs `source`/`dayOfMonth` from client-held state, risking a silent template overwrite

**Files:** `src/components/receita-form.tsx:258-263` (EditOccurrenceDialog → run('template')), `src/actions/incomes.ts:224-261`

**Issue:** The template-edit path re-sends `templateSource` and `templateDayOfMonth` from props the page never actually populates — `receitas/page.tsx:130-141` passes `templateSource={row.source}` (the *occurrence* snapshot, not the template) and omits `templateDayOfMonth`, so it defaults to `5`. `updateTemplate` then writes `day_of_month: 5` over whatever the real template day was. Editing only the *amount* of a recurring template via this dialog therefore silently resets its day-of-month to the 5th. That is a data-correctness regression for recurring receitas.

**Fix:** Fetch the template's real `source`/`day_of_month` server-side in `updateTemplate` and update only `amount_cents` when the dialog's intent is amount-only, or pass the genuine template fields (not the occurrence snapshot/defaults) from a query that selects the template row.

### WR-05: `parseBRLToCents` accepts malformed multi-separator input by collapsing all dots

**File:** `src/lib/money.ts:14-25`

**Issue:** `replace(/\./g, '')` strips *all* dots unconditionally, so `"1.2.3,45"` → `"123,45"` → `12345` cents and `"10.5"` (a user typing a US-style decimal) → `"105"` → `10500` cents (R$ 105,00, not R$ 10,50). The parser does not reject obviously malformed thousands grouping; it coerces it to a plausible-but-wrong value. For a money parser whose stated contract is "never silently corrupt," silent coercion of `10.5` → R$105 is a real foot-gun.

**Fix:** After normalization, optionally validate the grouping shape (`/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/` on the original, pre-strip string) and throw on a mismatch, so ambiguous input becomes a field error rather than a wrong amount.

### WR-06: `deleteOccurrence`/`updateOccurrence` parse no id and trust the client-supplied row id

**Files:** `src/actions/incomes.ts:191-221,264-277`; mirrors `transactions.ts:79,120` and `categories.ts:77,101,123,149,170`

**Issue:** Row-id arguments (`id: string`) are passed straight into `.eq('id', id)` with no `z.string().uuid()` guard. RLS makes this safe against cross-user writes (a foreign or garbage id matches zero of the caller's rows), so this is **not** an IDOR — but a non-UUID id triggers a `22P02` invalid-input-syntax DB error that the generic catch turns into a confusing toast, and it skips the boundary-validation discipline applied to every other field. Defense-in-depth + cleaner errors.

**Fix:** Add `z.string().uuid()` validation on every id argument before the query, returning the standard field error on failure. Cheap, consistent with the rest of the codebase.

---

_Reviewed: 2026-06-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
