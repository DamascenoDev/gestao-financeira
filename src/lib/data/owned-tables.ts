// src/lib/data/owned-tables.ts
// THE single source of truth for the user-owned table set (DATA-02 / SEC-01).
//
// BOTH the LGPD export bundle (06-03 exportMyData) AND the isolation matrix
// (06-01 rls-isolation / isolation-matrix tests) iterate this constant. Adding a
// table here in v2 (e.g. the spouse/multi-account work MUL-01) auto-extends both
// the export completeness proof and the per-user isolation proof — no table can
// silently ship without an isolation test or escape the LGPD export (Pitfalls 3+4).
//
// VERIFIED against supabase/migrations/: every table below declares
// `user_id uuid ... references auth.users(id) on delete cascade` and
// `enable row level security` with an `own <table>` policy
// `using ((select auth.uid()) = user_id)`. csv_import_profiles IS included
// (Open Question #1 → resolved INCLUDE: it is user-owned and LGPD-favorable).

/**
 * The canonical 14 user-owned tables, in a stable order. `as const` makes this a
 * readonly tuple usable as a literal-union type.
 */
export const OWNED_TABLES = [
  'profiles',
  'categories',
  'income_templates',
  'income_occurrences',
  'transactions',
  'budget_targets',
  'reservas',
  'reserva_ledger',
  'statements',
  'merchant_patterns',
  'csv_import_profiles',
  'mei_settings',
  'mei_year_flags',
  'mei_invoices',
] as const

/** Literal-union of the owned table names (e.g. 'transactions' | 'profiles' | …). */
export type OwnedTable = (typeof OWNED_TABLES)[number]

/**
 * Minimal RLS-rejectable INSERT row per owned table, owned by the given placeholder
 * user id. The isolation matrix inserts each of these AS USER B targeting USER A's
 * id: the RLS WITH CHECK must reject every one because `user_id` (or `id`, for
 * profiles) is not the caller's uid.
 *
 * Only NOT-NULL columns are populated. A placeholder uuid is used for any FK
 * (category_id, reserva_id, …) because WITH CHECK rejects on user_id BEFORE the FK
 * is resolved — so the row never has to satisfy the FK to prove isolation.
 *
 * Keyed as a function so the isolation test stays a clean single iteration over
 * OWNED_TABLES.
 */
export function isolationInsertShape(table: OwnedTable, userId: string): Record<string, unknown> {
  return ISOLATION_INSERT_SHAPES[table](userId)
}

/** Per-table minimal INSERT shape factories (owned by `userId`). */
export const ISOLATION_INSERT_SHAPES: Record<
  OwnedTable,
  (userId: string) => Record<string, unknown>
> = {
  profiles: (userId) => ({ id: userId, user_id: userId }),
  categories: (userId) => ({ user_id: userId, name: 'Hack', kind: 'consumo' }),
  income_templates: (userId) => ({
    user_id: userId,
    source: 'Hack',
    amount_cents: 100,
    day_of_month: 1,
  }),
  income_occurrences: (userId) => ({
    user_id: userId,
    source: 'Hack',
    amount_cents: 100,
    month_key: '2026-06',
    occurred_on: '2026-06-01',
  }),
  transactions: (userId) => ({
    user_id: userId,
    amount_cents: 100,
    occurred_on: '2026-06-01',
  }),
  budget_targets: (userId) => ({
    user_id: userId,
    category_id: crypto.randomUUID(),
    percent_bp: 3000,
    direction: 'teto',
  }),
  reservas: (userId) => ({
    user_id: userId,
    nome: 'Hack',
  }),
  reserva_ledger: (userId) => ({
    user_id: userId,
    reserva_id: crypto.randomUUID(),
    kind: 'in',
    amount_cents: 100,
    occurred_on: '2026-06-01',
  }),
  statements: (userId) => ({
    user_id: userId,
    storage_path: `${userId}/hack.ofx`,
    format: 'ofx',
    content_hash: 'hack',
  }),
  merchant_patterns: (userId) => ({
    user_id: userId,
    descriptor_norm: 'hack',
    category_id: crypto.randomUUID(),
  }),
  csv_import_profiles: (userId) => ({
    user_id: userId,
    header_signature: 'hack',
    mapping: {},
  }),
  mei_settings: (userId) => ({
    user_id: userId,
    mei_start_date: '2026-01-01',
  }),
  mei_year_flags: (userId) => ({
    user_id: userId,
    year: 2026,
  }),
  mei_invoices: (userId) => ({
    user_id: userId,
    issued_on: '2026-06-01',
    amount_cents: 100,
    tomador: 'X',
    activity_type: 'servicos',
  }),
}
