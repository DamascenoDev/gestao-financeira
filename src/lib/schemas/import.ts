import { z } from 'zod'

/**
 * Import boundary schemas (mirrors schemas/transaction.ts style). The single source
 * of truth for the CSV column-mapping payload (Plan 02) and the per-row confirm
 * payload (confirmImport, Plan 03), so the upload/review boundary cannot drift.
 */

/**
 * CSV column mapping: which header maps to date / descritor / valor. The three must
 * be DISTINCT — mapping two roles to one column is a user error caught here, not a
 * silent mis-parse (a duplicate column would otherwise read the same value twice).
 */
export const csvMappingSchema = z
  .object({
    dateCol: z.string().min(1, 'Selecione a coluna de data'),
    descCol: z.string().min(1, 'Selecione a coluna de descritor'),
    valorCol: z.string().min(1, 'Selecione a coluna de valor'),
  })
  .refine(
    (m) => new Set([m.dateCol, m.descCol, m.valorCol]).size === 3,
    { message: 'As colunas de data, descritor e valor devem ser distintas' },
  )

export type CsvMapping = z.infer<typeof csvMappingSchema>

/**
 * The per-row shape confirmImport validates before persisting (Plan 03). `amount`
 * accepts either the raw pt-BR string (CSV/manual edit, parsed via parseBRLToCents)
 * or already-derived integer cents (OFX path). categoryId is optional/nullable for
 * an unclassified (memory-miss, manually-skipped) row; reservaId is optional and
 * only meaningful when the chosen category is the Reserva one (RSV-06 aporte).
 * carroId is the per-row carro CHOICE (CAR-02) — nullable/optional like categoryId
 * (null/absent ⇒ untagged), free of category, re-derived for ownership server-side.
 * abastecimentoId + abastecimentoKind + parcelaNum are the reverse-link CHOICE
 * (CAR-09/CAR-11): the client passes only WHICH abastecimento the user confirmed (+
 * kind/parcela); the server re-derives ownership of `abastecimentoId` via
 * assertOwnedAbastecimento (WR-01 — FKs are not RLS-aware) before writing the link.
 * All three optional (absent ⇒ no link confirmed on this row).
 */
export const confirmImportRowSchema = z.object({
  id: z.string().min(1), // temp client row id
  dedupe_key: z.string().min(1),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  amount: z.union([z.string().min(1), z.number().int().positive()]),
  descriptor_raw: z.string(),
  descriptor_norm: z.string(),
  categoryId: z.string().uuid().nullable().optional(),
  reservaId: z.string().uuid().optional(),
  carroId: z.string().uuid().nullable().optional(),
  abastecimentoId: z.string().uuid().optional(),
  abastecimentoKind: z.enum(['avista', 'parcela']).optional(),
  parcelaNum: z.number().int().positive().optional(),
})

export type ConfirmImportRow = z.infer<typeof confirmImportRowSchema>
