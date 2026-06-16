import { z } from 'zod'

/**
 * Single source of truth for the budget-target form (client) + action (server),
 * mirroring transaction.ts so the contract cannot drift. `percentBp` is the percent
 * stored as integer basis-points (3000 = 30.00%): exact, no float. Domain rule
 * 0 < bp <= 10000 matches the DB CHECK on budget_targets.percent_bp. (BUD-01)
 */
export const budgetTargetSchema = z.object({
  categoryId: z.string().uuid('Selecione uma categoria'),
  percentBp: z.number().int().gt(0).lte(10000),
  direction: z.enum(['teto', 'alvo']),
})

export type BudgetTargetInput = z.infer<typeof budgetTargetSchema>
