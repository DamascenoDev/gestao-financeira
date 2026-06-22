# Phase 28: Vínculo reverso por valor + consumo sem double-count - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 7 (6 modified, 0 new files of code; the new code is additive into existing modules)
**Analogs found:** 7 / 7 (every seam already exists in-repo — this is a brownfield wiring phase)

> All analogs are IN THE SAME FILE being modified. The planner should mirror the named function verbatim in shape, not import from elsewhere. Line numbers verified against current HEAD on 2026-06-22.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/actions/import.ts` (`ingestStatement` match pass) | action / server | batch transform | the AI/keyword classification pass in the same fn (L422-558) | exact (self) |
| `src/actions/import.ts` (`confirmImport` link write) | action / server | CRUD | `insertedByKey` + carro_id IDOR re-derive in the same fn (L728-746, L901-926) | exact (self) |
| `src/lib/parsers/types.ts` (`ParsedReviewRow.abastecimentoMatch`) | model / type | transform | `ParsedReviewRow.suggestion` (L89) | exact |
| `src/lib/schemas/import.ts` (`confirmImportRowSchema` link fields) | schema / validation | request-response | `carroId` field in the same schema (L45) | exact |
| `src/components/import-review-table.tsx` (Carro cell + "Vincular todos") | component | event-driven | `InlineReviewCarroCell` (L1326), `applyAllSuggestions` (L466), `SuggestionSlot` (L1111) | exact (self) |
| `src/app/(app)/importar/[statementId]/page.tsx` | route / RSC | request-response | `carros` fetch + `reviewRows.map` (L181-219) | exact (self) |
| `src/lib/ownership.ts` (`assertOwnedAbastecimento`) | utility | CRUD | `assertOwnedCarro` / `assertOwnedTransaction` tri-state (L135-166) | exact |

---

## Pattern Assignments

### `src/actions/import.ts` — `ingestStatement` new match pass (action, batch transform)

**Analog:** the batched classification pass in the SAME function. This is the heart of the phase: the new value-match pass becomes one more layer in the existing memória→keyword→IA chain.

**Batched pre-fetch ONCE pattern** (the molde — mirror for "fetch unlinked abastecimentos + index by target value"). Categories at L423-436, keyword rules at L444-458, dupSet at L466-476. The dupSet is the closest shape (build a Set/Map from one `.in(...)` query for in-loop O(1) lookup):
```typescript
const keysByRaw = rawRows.map((raw) => dedupeKey(userId, raw))
const dupSet = new Set<string>()
if (keysByRaw.length > 0) {
  const { data: existingTxns } = await supabase
    .from('transactions')
    .select('dedupe_key')
    .in('dedupe_key', [...new Set(keysByRaw)])
  for (const t of existingTxns ?? []) {
    if (t.dedupe_key) dupSet.add(t.dedupe_key)
  }
}
```
New pass must fetch the user's UNLINKED abastecimentos (D-02: no date filter; RLS scopes to caller, no app-layer user_id) and build a Map keyed by the D-01 target-value set. WR-02: never a per-row query.

**Per-row loop attaches a NON-binding suggestion** (PASS 2 at L550-558 — the exact analog for attaching `abastecimentoMatch` without writing `category_id`/`carro_id`):
```typescript
if (suggestions.size > 0) {
  for (const row of rows) {
    if (row.category_id !== null) continue // never overwrite a memory hit
    const s = suggestions.get(row.descriptor_norm)
    if (s && s.categoryId !== null) {
      row.suggestion = { categoryId: s.categoryId, confidence: s.confidence, source: 'ia' }
    }
  }
}
```
New match pass mirrors this: after building the candidate index, loop rows and attach `row.abastecimentoMatch` (greedy 1:1 per D-04 — each candidate consumed by at most one row; closest-by-date per D-03). NEVER sets `carro_id`/`category_id` (sem auto-commit). Then persisted in `parsed_rows` (L573-593) so the match is server-sourced like the AI suggestion.

**D-01 predicate is integer-cents arithmetic** — use `floor(valor_total_cents / N)` and `ceil(...)` (`Math.floor` / `Math.ceil` over integers), never float. À-vista: `valor_lançamento === amount_cents`. Money helpers `parseBRLToCents`/`formatCents` from `src/lib/money.ts` for the parse/display edges only.

---

### `src/actions/import.ts` — `confirmImport` link write (action, CRUD)

**Analog:** the `carro_id` IDOR re-derive (L728-746) + `insertedByKey` (L914-926) in the SAME function. D-08 link write hooks in right after the tx insert loop.

**IDOR re-derive of a client FK choice** (L733-746 — mirror for re-deriving `abastecimentoId` ownership):
```typescript
const carroIds = [
  ...new Set(parsedRows.map((r) => r.carroId).filter((id): id is string => typeof id === 'string')),
]
for (const carroId of carroIds) {
  const owned = await assertOwnedCarro(supabase, carroId)
  if (owned === 'not-owned') return { error: 'Carro inválido.' }
  if (owned === 'error') return { error: 'Não foi possível confirmar a importação. Tente novamente.' }
}
```
New: collect distinct `abastecimentoId`s from the payload, call `assertOwnedAbastecimento` (tri-state), reject the WHOLE payload on a forged id. FKs are NOT RLS-aware (WR-01).

**`insertedByKey` = dedupe_key → new tx id** (L914-926 — the seam that gives the new tx id to write the link against):
```typescript
const insertedByKey = new Map<string, string>()
for (const ins of inserts) {
  const { data: inserted, error } = await supabase
    .from('transactions').insert(ins).select('id, dedupe_key').maybeSingle()
  if (error) {
    if (error.code === '23505') continue // dedupe_key already present → J (skip)
    return { error: 'Não foi possível importar as transações. Tente de novo.' }
  }
  if (inserted?.dedupe_key) insertedByKey.set(inserted.dedupe_key, inserted.id)
}
```
After this loop: for each row with a confirmed link, resolve the tx id. **D-09:** a dedupe-skipped row is NOT in `insertedByKey` — do a batched `.in('dedupe_key', [...])` lookup of existing tx ids (mirror the dupSet fetch) so a confirmed link on an already-imported parcela still writes.

**Link write, mirroring the carro_id persist + the abastecimentos.ts attach:**
- À-vista: `update abastecimentos set transaction_id = <txId> where id = <abastecimentoId>` + carro_id sync onto the tx (see abastecimentos.ts L158-166).
- Parcelado: `insert abastecimento_parcelas` (`user_id`, `abastecimento_id`, `transaction_id`, `parcela_num`). `parcela_num` = count already in junction + assigned-this-fatura + 1 (per 0039: `unique(abastecimento_id, parcela_num)`, `unique(transaction_id)` are the backstops).

**Partial-failure semantics** (mirror the LEARN failure at L985-989 — the tx already landed, so surface-but-keep):
```typescript
if (learnError) {
  return { error: 'As transações foram importadas, mas a memória não atualizou.' }
}
```
Use the analogous message for a link write that fails after the tx insert (e.g. "...mas o vínculo do abastecimento não foi salvo"). A `23505` on the junction/transaction_id uniq is the duplo-link backstop — swallow or map like the abastecimentos.ts `ALREADY_LINKED` path.

**FUEL-01 apply-on-confirm:** D-06 says confirming the link pre-fills "Combustível" in CLIENT state (the grid), overriding IA/memória/keyword. So `category_id` arrives in the payload already = Combustível; `confirmImport` persists it as a normal classified row (no special server branch needed beyond honoring the client's categoryId, which is already IDOR-checked at L703-712). The category remains editable until final confirm.

---

### `src/lib/ownership.ts` — `assertOwnedAbastecimento` (utility, CRUD)

**Analog:** `assertOwnedCarro` (L159-166) / `assertOwnedTransaction` (L135-142) — tri-state, identical body shape. Mirror verbatim:
```typescript
export async function assertOwnedAbastecimento(
  supabase: Client,
  id: string,
): Promise<OwnershipResult> {
  const { data, error } = await supabase.from('abastecimentos').select('id').eq('id', id)
  if (error) return 'error'
  return data?.length === 1 ? 'owned' : 'not-owned'
}
```
`OwnershipResult` = `'owned' | 'not-owned' | 'error'` (already defined in this file). RLS scopes the select to the caller, so 1 row = owned, 0 = forged/foreign.

---

### `src/lib/parsers/types.ts` — `ParsedReviewRow.abastecimentoMatch` (type)

**Analog:** the `suggestion?` field (L89). Add a sibling optional field mirroring its shape + JSDoc tone ("palpite NÃO-vinculante, NUNCA aplicado a category_id/carro_id sem confirmação"):
```typescript
suggestion?: { categoryId: string | null; confidence: number; source: 'ia' }
```
New field (Claude's discretion on exact shape, per CONTEXT L114-117), e.g.:
```typescript
abastecimentoMatch?: {
  abastecimentoId: string
  kind: 'avista' | 'parcela'
  parcelaNum?: number      // present for kind === 'parcela'
  carroId: string
  carroApelido: string
}
```
Optional so old persisted rows + the pure parsers stay byte-compatible (same rule as `suggestion`/`duplicate`).

---

### `src/lib/schemas/import.ts` — `confirmImportRowSchema` link fields (schema)

**Analog:** the `carroId` field (L45) in the same schema. Extend the object with the link payload, mirroring nullable/optional + `.uuid()`:
```typescript
carroId: z.string().uuid().nullable().optional(),
```
Add e.g. `abastecimentoId: z.string().uuid().optional()` and `abastecimentoKind: z.enum(['avista','parcela']).optional()` / `parcelaNum: z.number().int().positive().optional()`. The client passes only the CHOICE; the server re-derives ownership of `abastecimentoId` (WR-01). Keep the `ConfirmImportRow` type inference at L48.

---

### `src/components/import-review-table.tsx` — Carro cell + "Vincular todos" (component, event-driven)

**Analog:** three in-file patterns.

**(a) `InlineReviewCarroCell` (L1326-1372)** — anchor the link suggestion HERE (D-05), not a 3rd column. Currently a plain Select tagging `carro_id`. Extend so that when `row.abastecimentoMatch` is present it shows the suggested carro + a confirm/discard affordance (mirror `SuggestionSlot` styling). The cell already calls `onTag` (L1336):
```typescript
function onChange(next: string) {
  onTag(row.id, next === NENHUM_CARRO ? null : next)
}
```

**(b) `tagCarroRow` (L498-502)** — the client-state-only writer to mirror for "confirm link" (sets carro_id + the link fields + applies Combustível category, all in client state, no DB write):
```typescript
const tagCarroRow = React.useCallback((id: string, carroId: string | null) => {
  setRows((prev) => prev.map((r) => (r.id === id ? { ...r, carro_id: carroId } : r)))
}, [])
```
New "confirmLink" callback: `{ ...r, carro_id, abastecimentoId, category_id: combustivelId, origin: 'manual' }` — overriding IA/memória per D-06. Discard = clear `abastecimentoMatch` only.

**(c) `applyAllSuggestions` (L466-494)** — the batch button molde for "Vincular todos" (D-07). Same pure-reducer + toast-once shape:
```typescript
setRows((prev) => prev.map((r) => {
  if (isConfidentPending(r)) {
    return { ...r, category_id: r.suggestion!.categoryId, reserva_id: null, origin: 'manual' as const }
  }
  return r
}))
```
New "Vincular todos": iterate rows with a non-null `abastecimentoMatch`, apply the link + carro_id + Combustível. The match is exact-value 1:1 (high precision), so batch is safe (D-07). Button placement mirrors the existing apply-all button (L804). `ReviewRow` type needs `abastecimentoMatch` threaded (extend at L279, alongside `suggestion`).

---

### `src/app/(app)/importar/[statementId]/page.tsx` — RSC (route)

**Analog:** the `carros` fetch (L181-189) + `reviewRows.map` (L193-219) in the same file.

**Decision (D-05 server-as-source-of-truth, preferred):** the match is resolved in `ingestStatement` and persisted in `parsed_rows`, so the RSC does NOT need to fetch unlinked abastecimentos — it just threads `r.abastecimentoMatch` through the existing map (mirror how `suggestion` is threaded at L219+). The `carros` fetch stays as-is (still needed for the Carro select labels). Mirror the map field-thread:
```typescript
carro_id: null, // CAR-02: tagging happens in review; nothing pre-tagged at ingest
```
Add `abastecimentoMatch: r.abastecimentoMatch` to the mapped `ReviewRow`.

---

## Shared Patterns

### Ownership re-derive (IDOR, WR-01) — tri-state
**Source:** `src/lib/ownership.ts` L135-166 (`assertOwnedTransaction`, `assertOwnedCarro`)
**Apply to:** `confirmImport` (new `assertOwnedAbastecimento` for `abastecimentoId`)
Every client-supplied FK is re-derived owner-scoped before any write; `'error'` → generic retry, `'not-owned'` → reject whole payload. FKs are not RLS-aware.

### Batched fetch, never per-row (WR-02)
**Source:** `src/actions/import.ts` L444-476 (keyword rules + dupSet via one `.in(...)`)
**Apply to:** the match-pass candidate fetch AND the D-09 dedupe_key→txId lookup
One query, build a Set/Map, O(1) in-loop reads.

### Sem auto-commit / non-binding suggestion
**Source:** `src/actions/import.ts` L550-558 + `src/components/suggestion-slot.tsx`
**Apply to:** `abastecimentoMatch` attach (server) + the Carro-cell affordance (client)
A suggestion never writes `category_id`/`carro_id`/link at parse; only the user's confirm sets client state; only `confirmImport` persists.

### 1:1 link defense-in-depth
**Source:** `src/actions/abastecimentos.ts` L125-152 (pre-check + 23505 swallow) and `0039` unique indexes
**Apply to:** the link write in `confirmImport`
Greedy 1:1 in the match pass (D-04) avoids generating the dup suggestion; `abastecimento_parcelas_transaction_uniq` / `abastecimentos_transaction_uniq` are the insert-time backstop (map 23505 → already-linked, never a 500).

### Money = integer centavos
**Source:** `src/lib/money.ts` (`parseBRLToCents` L22, `formatCents` L94)
**Apply to:** the D-01 floor/ceil predicate (pure integer arithmetic) + any display of the matched value
Never float; parse at ingest, format at the display edge only.

---

## No Analog Found

None. Every seam this phase wires already exists in the repo. The match pass is novel logic but its SHAPE is the existing classification pass; the link write is novel but mirrors the carro_id persist + the abastecimentos.ts attach.

## CAR-12 verification (no new code)
**Source:** `supabase/migrations/0039` views (`v_abastecimento_consumo` cost CASE at L161/L198) + `src/lib/carro/consumo.ts`
The views already count parcelado cost from `valor_total_cents` ONCE and coalesce(real, esperado) for à-vista; km/l = litros + odômetro only (no fatura dependency). P28 only FEEDS the views by creating the linked rows — verify the numbers, write no report SQL.

## Metadata

**Analog search scope:** `src/actions/`, `src/lib/`, `src/components/`, `src/app/(app)/importar/`, `supabase/migrations/0039`
**Files scanned:** 9
**Pattern extraction date:** 2026-06-22
