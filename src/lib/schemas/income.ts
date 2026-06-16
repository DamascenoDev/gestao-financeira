import { z } from 'zod'

/**
 * Shared Zod schemas for receitas (form + action), mirroring auth-schema.ts.
 * `amount` is the raw pt-BR string parsed to centavos server-side via parseBRLToCents.
 * (INC-01/02/03)
 */

/** Recurring income template: source + default amount + day-of-month + active flag. */
export const incomeTemplateSchema = z.object({
  source: z.string().trim().min(1, 'Informe a fonte').max(120),
  amount: z.string().min(1, 'Informe o valor'),
  dayOfMonth: z.coerce.number().int().min(1, 'Dia inválido').max(31, 'Dia inválido'),
  isActive: z.boolean().default(true),
})

/** Per-month occurrence edit: only the amount changes (INC-02 — never touches the template). */
export const incomeOccurrenceSchema = z.object({
  amount: z.string().min(1, 'Informe o valor'),
})

/** Ad-hoc avulsa income: a single dated receita with no template (INC-03). */
export const incomeAdhocSchema = z.object({
  source: z.string().trim().min(1, 'Informe a fonte').max(120),
  amount: z.string().min(1, 'Informe o valor'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
})

export type IncomeTemplateInput = z.infer<typeof incomeTemplateSchema>
export type IncomeOccurrenceInput = z.infer<typeof incomeOccurrenceSchema>
export type IncomeAdhocInput = z.infer<typeof incomeAdhocSchema>
