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
  // CAR-02: optional carro tag — FREE of category (any expense can be tagged to a
  // carro). Nullable so the form can send an explicit clear ("Nenhum"); absent /
  // undefined means "no change to carro on this path" (mirrors
  // confirmImportRowSchema's nullable-optional categoryId).
  carroId: z.string().uuid('Selecione um carro').nullable().optional(),
})

export type TransactionInput = z.infer<typeof transactionSchema>
