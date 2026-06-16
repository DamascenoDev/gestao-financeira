import { z } from 'zod'

/**
 * Single source of truth for transaction form (client) + action (server) validation,
 * mirroring auth-schema.ts so the contract cannot drift. `amount` is the raw pt-BR
 * string ("R$ 1.234,56"); it is parsed to integer centavos via parseBRLToCents on the
 * server. (TXN-01/02)
 */
export const transactionSchema = z.object({
  description: z.string().trim().max(200).default(''),
  amount: z.string().min(1, 'Informe o valor'),
  categoryId: z.string().uuid('Selecione uma categoria'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
})

export type TransactionInput = z.infer<typeof transactionSchema>
