import { z } from 'zod'

/**
 * Shared Zod schemas for the MEI module (form ↔ Server Action), mirroring
 * schemas/income.ts + schemas/reserva.ts. Money fields are raw pt-BR strings
 * ("R$ 1.234,56") parsed to integer centavos server-side via parseBRLToCents —
 * never floats (the receita BRUTA of a NF). Civil dates are 'YYYY-MM-DD'.
 * (MEI-01 / MEI-02 / MEI-03)
 */

/** The two MEI activity buckets a NF can belong to (DASN split, MEI-03). */
export const MEI_ACTIVITY_TYPES = ['comercio_industria', 'servicos'] as const

/** A civil date 'YYYY-MM-DD' — shape only; impossible days are caught downstream. */
const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')

/**
 * Register/edit a NF: issued_on civil date, amount a raw pt-BR money string
 * (parsed to positive centavos server-side), tomador required, descricao optional,
 * activity_type one of the two DASN buckets (per NF — a MEI can have mixed revenue).
 */
export const meiInvoiceSchema = z.object({
  issuedOn: civilDate,
  // Raw pt-BR money string, parsed server-side; the GROSS billed value (never net).
  amount: z.string().min(1, 'Informe o valor'),
  tomador: z.string().trim().min(1, 'Informe o tomador').max(120),
  descricao: z.string().trim().max(240).optional(),
  activityType: z.enum(MEI_ACTIVITY_TYPES, {
    message: 'Selecione o tipo de atividade',
  }),
})

/** MEI settings: the single start date that drives the 1º-ano proportional limit. */
export const meiSettingsSchema = z.object({
  meiStartDate: civilDate,
})

/** Per-year DASN flag: had an employee during the calendar year (default Não). */
export const meiYearFlagSchema = z.object({
  year: z.coerce.number().int().min(2000, 'Ano inválido').max(2100, 'Ano inválido'),
  hasEmployee: z.coerce.boolean(),
})

export type MeiInvoiceInput = z.infer<typeof meiInvoiceSchema>
export type MeiSettingsInput = z.infer<typeof meiSettingsSchema>
export type MeiYearFlagInput = z.infer<typeof meiYearFlagSchema>
export type MeiActivityType = (typeof MEI_ACTIVITY_TYPES)[number]
