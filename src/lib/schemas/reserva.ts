import { z } from 'zod'

/**
 * Shared Zod schemas for reservas (form + action), mirroring transaction.ts.
 * Money fields are raw pt-BR strings ("R$ 1.234,56") parsed to integer centavos
 * server-side via parseBRLToCents — never floats. (RSV-01/04/05)
 */

/** Create/edit a reserva: nome required, alvo optional (no alvo → no progress bar). */
export const reservaSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(60),
  // Raw pt-BR money string, parsed server-side; optional (RSV-01: alvo is optional).
  alvo: z.string().optional(),
})

/** Register a saída (withdrawal) against a reserva — validated ≤ saldo server-side. */
export const saidaSchema = z.object({
  reservaId: z.string().uuid('Selecione uma reserva'),
  amount: z.string().min(1, 'Informe o valor'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  note: z.string().optional(),
})

export type ReservaInput = z.infer<typeof reservaSchema>
export type SaidaInput = z.infer<typeof saidaSchema>
