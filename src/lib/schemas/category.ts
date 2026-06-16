import { z } from 'zod'

/**
 * Shared Zod schema for category create/rename/kind/color (form + action), mirroring
 * auth-schema.ts. `kind` uses ASCII enum values matching the DB check constraint
 * ('consumo'/'alocacao'); `color` is one of the fixed 8-swatch palette keys (UI-SPEC),
 * optional. (CAT-03 + color decision)
 */

export const CATEGORY_KINDS = ['consumo', 'alocacao'] as const
export const CATEGORY_COLORS = [
  'slate',
  'red',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
] as const

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(60),
  kind: z.enum(CATEGORY_KINDS),
  color: z.enum(CATEGORY_COLORS).optional(),
})

export type CategoryKind = (typeof CATEGORY_KINDS)[number]
export type CategoryColor = (typeof CATEGORY_COLORS)[number]
export type CategoryInput = z.infer<typeof categorySchema>
